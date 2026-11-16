// Servicio HTTP que envuelve whatsmeow para el estudio.
//
// No forma parte de Vercel: whatsmeow necesita un WebSocket abierto durante
// días y una función serverless muere a los 300 s. Este proceso corre en
// Railway (o Render) y Vercel lo llama servidor a servidor.
//
// Todas las rutas salvo /health exigen X-Servicio-Token. El token nunca llega
// al navegador: /api/admin/whatsapp/* en Vercel hace de proxy con requireAdmin.

package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

var errNoConectado = errors.New("WhatsApp no está vinculado o la sesión está desconectada")

type servidor struct {
	sesion *Sesion
	token  string
}

func main() {
	token := os.Getenv("WA_SERVICIO_TOKEN")
	if token == "" {
		log.Fatal("Falta WA_SERVICIO_TOKEN: el servicio no puede quedar abierto.")
	}

	ctx := context.Background()
	sesion, err := NuevaSesion(ctx)
	if err != nil {
		log.Fatalf("No se pudo iniciar la sesión de WhatsApp: %v", err)
	}
	defer sesion.Cerrar()

	s := &servidor{sesion: sesion, token: token}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /status", s.conToken(s.status))
	mux.HandleFunc("GET /qr", s.conToken(s.qr))
	mux.HandleFunc("POST /pair", s.conToken(s.pair))
	mux.HandleFunc("POST /send", s.conToken(s.enviar))
	mux.HandleFunc("POST /logout", s.conToken(s.logout))

	puerto := os.Getenv("PORT")
	if puerto == "" {
		puerto = "8080"
	}

	srv := &http.Server{
		Addr:              ":" + puerto,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("whatsapp-service escuchando en :%s", puerto)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("servidor HTTP: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Println("cerrando…")
	ctxCierre, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctxCierre)
}

func (s *servidor) conToken(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		recibido := r.Header.Get("X-Servicio-Token")
		if len(recibido) != len(s.token) ||
			subtle.ConstantTimeCompare([]byte(recibido), []byte(s.token)) != 1 {
			jsonRespuesta(w, http.StatusUnauthorized, map[string]any{
				"ok":    false,
				"error": "token_invalido",
			})
			return
		}
		next(w, r)
	}
}

func (s *servidor) health(w http.ResponseWriter, _ *http.Request) {
	jsonRespuesta(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *servidor) status(w http.ResponseWriter, _ *http.Request) {
	estado := s.sesion.Estado()
	jsonRespuesta(w, http.StatusOK, map[string]any{
		"ok":           true,
		"conectado":    estado.Conectado,
		"jid":          estado.JID,
		"numero":       estado.Numero,
		"desde":        estado.Desde,
		"ultimo_error": estado.UltimoError,
	})
}

func (s *servidor) qr(w http.ResponseWriter, _ *http.Request) {
	qr := s.sesion.QR()
	if qr == "" {
		if s.sesion.Estado().Conectado {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		jsonRespuesta(w, http.StatusNotFound, map[string]any{
			"ok":    false,
			"error": "sin_qr",
		})
		return
	}
	jsonRespuesta(w, http.StatusOK, map[string]any{"ok": true, "qr": qr})
}

func (s *servidor) pair(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 35*time.Second)
	defer cancel()

	qr, err := s.sesion.Emparejar(ctx)
	if err != nil {
		if errors.Is(err, errYaConectado) {
			jsonRespuesta(w, http.StatusOK, map[string]any{"ok": true, "conectado": true, "qr": nil})
			return
		}
		jsonRespuesta(w, http.StatusBadGateway, map[string]any{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}
	jsonRespuesta(w, http.StatusOK, map[string]any{"ok": true, "conectado": false, "qr": qr})
}

type peticionEnvio struct {
	To    string `json:"to"`
	Texto string `json:"texto"`
	Text  string `json:"text"`
}

func (s *servidor) enviar(w http.ResponseWriter, r *http.Request) {
	var p peticionEnvio
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&p); err != nil {
		jsonRespuesta(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "json_invalido"})
		return
	}
	if p.Texto == "" {
		p.Texto = p.Text
	}
	if p.To == "" || p.Texto == "" {
		jsonRespuesta(w, http.StatusBadRequest, map[string]any{
			"ok":    false,
			"error": "faltan_to_o_texto",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	id, err := s.sesion.Enviar(ctx, p.To, p.Texto)
	if err != nil {
		codigo := http.StatusBadGateway
		if errors.Is(err, errNoConectado) {
			codigo = http.StatusServiceUnavailable
		}
		jsonRespuesta(w, codigo, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	jsonRespuesta(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

func (s *servidor) logout(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	if err := s.sesion.Desvincular(ctx); err != nil {
		jsonRespuesta(w, http.StatusBadGateway, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	jsonRespuesta(w, http.StatusOK, map[string]any{"ok": true})
}

func jsonRespuesta(w http.ResponseWriter, codigo int, cuerpo any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(codigo)
	_ = json.NewEncoder(w).Encode(cuerpo)
}
