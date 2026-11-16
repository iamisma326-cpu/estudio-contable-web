// Aviso de baja por WhatsApp.
//
// El servicio Go no tiene acceso a la base de Neon: cuando un cliente
// responde BAJA, se llama a un webhook de Vercel autenticado con el mismo
// token interno. Si el webhook no está configurado, el mensaje se ignora y
// queda registrado en el log; la baja por email sigue funcionando.

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

func (s *Sesion) notificarBaja(numero string) {
	url := strings.TrimSpace(os.Getenv("WA_BAJA_WEBHOOK_URL"))
	token := strings.TrimSpace(os.Getenv("WA_SERVICIO_TOKEN"))
	if url == "" || token == "" {
		s.log.Warnf("baja por WhatsApp sin WA_BAJA_WEBHOOK_URL configurado")
		return
	}

	cuerpo, err := json.Marshal(map[string]string{"telefono": numero})
	if err != nil {
		s.log.Errorf("serializar baja: %v", err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(cuerpo))
	if err != nil {
		s.log.Errorf("crear webhook de baja: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Servicio-Token", token)

	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
	if err != nil {
		s.log.Errorf("webhook de baja: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		s.log.Errorf("webhook de baja respondió %s", fmt.Sprint(resp.StatusCode))
	}
}
