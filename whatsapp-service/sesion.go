// Sesión de whatsmeow con almacenamiento persistente.
//
// Dos modos, elegidos por variable de entorno:
//   WA_DB_URL  → Postgres (Neon). Pensado para hosting sin disco.
//   WA_DB_PATH → SQLite en volumen (/data/wa.db). Pensado para Railway.
//
// La sesión sobrevive a reinicios y arranques en frío: al volver, el cliente
// retoma el vínculo y no se vuelve a pedir el QR.

package main

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/lib/pq"
	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

var errYaConectado = errors.New("WhatsApp ya está vinculado")

type Estado struct {
	Conectado   bool
	JID         string
	Numero      string
	Desde       string
	UltimoError string
}

type Sesion struct {
	mu             sync.RWMutex
	container      *sqlstore.Container
	client         *whatsmeow.Client
	log            waLog.Logger
	qr             string
	qrAt           time.Time
	qrTTL          time.Duration
	emparejando    bool
	conectadoDesde time.Time
	ultimoError    string
}

func NuevaSesion(ctx context.Context) (*Sesion, error) {
	logger := waLog.Stdout("whatsmeow", "INFO", true)

	var container *sqlstore.Container
	var err error

	if dsn := strings.TrimSpace(os.Getenv("WA_DB_URL")); dsn != "" {
		sqlstore.PostgresArrayWrapper = pqArray
		container, err = sqlstore.New(ctx, "postgres", dsn, logger)
		if err != nil {
			return nil, fmt.Errorf("postgres: %w", err)
		}
	} else {
		path := strings.TrimSpace(os.Getenv("WA_DB_PATH"))
		if path == "" {
			path = "/data/wa.db"
		}
		if dir := filepath.Dir(path); dir != "" && dir != "." {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return nil, fmt.Errorf("crear %s: %w", dir, err)
			}
		}
		container, err = sqlstore.New(ctx, "sqlite3", "file:"+path+"?_foreign_keys=on", logger)
		if err != nil {
			return nil, fmt.Errorf("sqlite: %w", err)
		}
	}

	device, err := container.GetFirstDevice(ctx)
	if err != nil {
		_ = container.Close()
		return nil, fmt.Errorf("leer dispositivo: %w", err)
	}

	s := &Sesion{container: container, client: whatsmeow.NewClient(device, logger), log: logger}
	s.client.AddEventHandler(s.evento)

	// Si ya hay una sesión guardada, reconecta en segundo plano. Si no, se
	// espera a que el admin pida el QR.
	if device.ID != nil {
		go func() {
			if err := s.client.Connect(); err != nil && !errors.Is(err, whatsmeow.ErrAlreadyConnected) {
				s.setError(fmt.Errorf("reconectar: %w", err))
			}
		}()
	}

	return s, nil
}

func (s *Sesion) evento(evt any) {
	switch evt := evt.(type) {
	case *events.Connected:
		s.mu.Lock()
		s.conectadoDesde = time.Now()
		s.ultimoError = ""
		s.qr = ""
		s.emparejando = false
		s.mu.Unlock()
	case *events.Disconnected:
		s.mu.Lock()
		s.ultimoError = "desconectado de WhatsApp; se reintentará automáticamente"
		s.mu.Unlock()
	case *events.LoggedOut:
		s.mu.Lock()
		s.ultimoError = "WhatsApp cerró la sesión (dispositivo desvinculado)"
		s.conectadoDesde = time.Time{}
		s.qr = ""
		s.emparejando = false
		s.mu.Unlock()
		// El store se borra en el cliente; hay que crear uno nuevo para que
		// el admin pueda volver a vincular sin reiniciar el servicio.
		go s.recrearClienteDespuesDeLogout()
	case *events.Message:
		s.procesarMensaje(evt)
	}
}

// procesarMensaje solo atiende la baja por WhatsApp. Si el cliente responde
// BAJA, se avisa a Vercel para desactivar su suscripción. Los mensajes de
// grupo y los propios se ignoran: una baja solo puede pedirla el titular del
// número desde su chat directo.
func (s *Sesion) procesarMensaje(evt *events.Message) {
	if evt == nil || evt.Message == nil || evt.Info.IsFromMe || evt.Info.IsGroup {
		return
	}

	texto := evt.Message.GetConversation()
	if texto == "" {
		if extendido := evt.Message.GetExtendedTextMessage(); extendido != nil {
			texto = extendido.GetText()
		}
	}

	palabra := strings.Trim(strings.TrimSpace(texto), " .,;:!¡¿?\"'")
	if !strings.EqualFold(palabra, "BAJA") {
		return
	}

	// WhatsApp puede direccionar por teléfono (s.whatsapp.net) o por LID.
	// Se prefiere el teléfono y, si el remitente viene como LID, se usa la
	// dirección alternativa que sí contiene el número.
	numero := ""
	switch {
	case evt.Info.Sender.Server == types.DefaultUserServer:
		numero = evt.Info.Sender.User
	case evt.Info.SenderAlt.Server == types.DefaultUserServer:
		numero = evt.Info.SenderAlt.User
	}
	if numero == "" {
		return
	}
	s.log.Infof("solicitud de baja recibida por WhatsApp")
	go s.notificarBaja(numero)
}

func (s *Sesion) setError(err error) {
	s.mu.Lock()
	s.ultimoError = err.Error()
	s.mu.Unlock()
}

func (s *Sesion) Estado() Estado {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// IsConnected() también es true mientras el WebSocket está abierto
	// esperando el QR. "Vinculado" exige que el dispositivo tenga JID: sin
	// eso, el panel cerraría el modal antes de escanear.
	vinculado := s.client.Store != nil && s.client.Store.ID != nil
	conectado := vinculado && s.client.IsConnected()
	jid := ""
	numero := ""
	if vinculado {
		jid = s.client.Store.ID.String()
		numero = s.client.Store.ID.User
	}
	desde := ""
	if !s.conectadoDesde.IsZero() {
		desde = s.conectadoDesde.Format(time.RFC3339)
	}

	return Estado{
		Conectado:   conectado,
		JID:         jid,
		Numero:      numero,
		Desde:       desde,
		UltimoError: s.ultimoError,
	}
}

func (s *Sesion) qrVigenteLocked() bool {
	ttl := s.qrTTL
	if ttl <= 0 {
		ttl = 20 * time.Second
	}
	return s.qr != "" && time.Since(s.qrAt) < ttl
}

func (s *Sesion) QR() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.qrVigenteLocked() {
		return ""
	}
	return s.qr
}

// Emparejar arranca el canal de QR y devuelve el primero como PNG base64.
// Si ya hay sesión conectada, devuelve errYaConectado.
func (s *Sesion) Emparejar(ctx context.Context) (string, error) {
	s.mu.Lock()
	if s.client.Store != nil && s.client.Store.ID != nil && s.client.IsConnected() {
		s.mu.Unlock()
		return "", errYaConectado
	}
	if s.qrVigenteLocked() {
		qr := s.qr
		s.mu.Unlock()
		return qr, nil
	}
	if s.emparejando {
		qr := s.qr
		fresco := s.qrVigenteLocked()
		s.mu.Unlock()
		if fresco {
			return qr, nil
		}
		return "", errors.New("el emparejamiento ya está en curso; espera unos segundos")
	}
	s.emparejando = true
	s.ultimoError = ""
	client := s.client
	s.mu.Unlock()

	// El consumidor del canal QR debe vivir más que esta petición HTTP: si
	// usara el contexto del request, el panel dejaría de recibir los QR
	// renovados en cuanto /pair respondiera. El canal se cierra solo al
	// vincular, caducar o fallar.
	qrCtx, cancelarQr := context.WithCancel(context.WithoutCancel(ctx))
	canal, err := client.GetQRChannel(qrCtx)
	if err != nil {
		cancelarQr()
		s.mu.Lock()
		s.emparejando = false
		s.mu.Unlock()
		return "", fmt.Errorf("abrir canal QR: %w", err)
	}

	go s.consumirQR(qrCtx, canal)

	if err := client.Connect(); err != nil && !errors.Is(err, whatsmeow.ErrAlreadyConnected) {
		cancelarQr()
		s.mu.Lock()
		s.emparejando = false
		s.ultimoError = err.Error()
		s.mu.Unlock()
		return "", fmt.Errorf("conectar: %w", err)
	}

	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		if client.Store != nil && client.Store.ID != nil {
			return "", errYaConectado
		}
		if qr := s.QR(); qr != "" {
			return qr, nil
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}

	return "", errors.New("WhatsApp no emitió un QR a tiempo; inténtalo otra vez")
}

func (s *Sesion) consumirQR(ctx context.Context, canal <-chan whatsmeow.QRChannelItem) {
	for {
		select {
		case <-ctx.Done():
			return
		case item, ok := <-canal:
			if !ok {
				s.mu.Lock()
				s.emparejando = false
				s.qr = ""
				s.qrTTL = 0
				s.mu.Unlock()
				return
			}
			if item.Event == "code" {
				png, err := qrDataURL(item.Code)
				if err != nil {
					s.setError(fmt.Errorf("generar QR: %w", err))
					continue
				}
				s.mu.Lock()
				s.qr = png
				s.qrAt = time.Now()
				if item.Timeout > 0 {
					s.qrTTL = item.Timeout
				} else {
					s.qrTTL = 20 * time.Second
				}
				s.mu.Unlock()
				continue
			}

			switch item {
			case whatsmeow.QRChannelSuccess:
				s.mu.Lock()
				s.qr = ""
				s.qrTTL = 0
				s.emparejando = false
				s.ultimoError = ""
				s.mu.Unlock()
			case whatsmeow.QRChannelTimeout:
				s.mu.Lock()
				s.emparejando = false
				s.qr = ""
				s.qrTTL = 0
				s.ultimoError = "el QR caducó sin escanearse"
				s.mu.Unlock()
				return
			default:
				if item.Event == "error" && item.Error != nil {
					s.setError(item.Error)
					s.mu.Lock()
					s.qr = ""
					s.emparejando = false
					s.mu.Unlock()
					return
				}
			}
		}
	}
}

func (s *Sesion) Enviar(ctx context.Context, destino string, texto string) (string, error) {
	s.mu.RLock()
	client := s.client
	s.mu.RUnlock()

	if client.Store == nil || client.Store.ID == nil || !client.IsConnected() {
		return "", errNoConectado
	}

	digits := soloDigitos(destino)
	if len(digits) < 8 || len(digits) > 15 {
		return "", errors.New("destino inválido: se esperaba un número E.164 sin signos")
	}

	jid, err := types.ParseJID(digits + "@s.whatsapp.net")
	if err != nil {
		return "", fmt.Errorf("destino inválido: %w", err)
	}

	resp, err := client.SendMessage(ctx, jid, &waE2E.Message{
		Conversation: proto.String(texto),
	})
	if err != nil {
		return "", fmt.Errorf("enviar WhatsApp: %w", err)
	}
	return string(resp.ID), nil
}

func (s *Sesion) Desvincular(ctx context.Context) error {
	s.mu.Lock()
	client := s.client
	s.mu.Unlock()

	if client.Store == nil || client.Store.ID == nil {
		// Puede haber un emparejamiento abierto sin escanear: se corta y se
		// recrea el cliente para que el próximo QR parta de cero.
		client.Disconnect()
		device, err := s.container.GetFirstDevice(ctx)
		if err != nil {
			return fmt.Errorf("reiniciar dispositivo: %w", err)
		}
		nuevo := whatsmeow.NewClient(device, s.log)
		nuevo.AddEventHandler(s.evento)
		s.mu.Lock()
		s.client = nuevo
		s.qr = ""
		s.emparejando = false
		s.conectadoDesde = time.Time{}
		s.ultimoError = ""
		s.mu.Unlock()
		return nil
	}

	if err := client.Logout(ctx); err != nil {
		return fmt.Errorf("cerrar sesión de WhatsApp: %w", err)
	}
	client.Disconnect()

	device, err := s.container.GetFirstDevice(ctx)
	if err != nil {
		return fmt.Errorf("preparar nuevo dispositivo: %w", err)
	}
	nuevo := whatsmeow.NewClient(device, s.log)
	nuevo.AddEventHandler(s.evento)

	s.mu.Lock()
	s.client = nuevo
	s.qr = ""
	s.emparejando = false
	s.conectadoDesde = time.Time{}
	s.ultimoError = ""
	s.mu.Unlock()
	return nil
}

func (s *Sesion) recrearClienteDespuesDeLogout() {
	s.mu.RLock()
	client := s.client
	container := s.container
	s.mu.RUnlock()

	client.Disconnect()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if client.Store != nil {
		_ = client.Store.Delete(ctx)
	}

	device, err := container.GetFirstDevice(ctx)
	if err != nil {
		s.setError(fmt.Errorf("preparar dispositivo tras logout: %w", err))
		return
	}
	nuevo := whatsmeow.NewClient(device, s.log)
	nuevo.AddEventHandler(s.evento)

	s.mu.Lock()
	// Si el admin ya inició otra vinculación, no pisar ese cliente.
	if s.client == client {
		s.client = nuevo
		s.qr = ""
		s.emparejando = false
		s.conectadoDesde = time.Time{}
	}
	s.mu.Unlock()
}

func (s *Sesion) Cerrar() {
	s.mu.RLock()
	client := s.client
	container := s.container
	s.mu.RUnlock()

	if client != nil {
		client.Disconnect()
	}
	if container != nil {
		_ = container.Close()
	}
}

// pqArray conecta el wrapper de arrays que whatsmeow exige con lib/pq.
func pqArray(value any) interface {
	driver.Valuer
	sql.Scanner
} {
	return pq.Array(value)
}

func soloDigitos(value string) string {
	var b strings.Builder
	for _, r := range value {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
