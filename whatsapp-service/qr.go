// Generación del QR como PNG base64 para mostrarlo en /admin sin que el
// navegador hable con este servicio.

package main

import (
	"encoding/base64"
	"fmt"

	qrcode "github.com/skip2/go-qrcode"
)

func qrDataURL(code string) (string, error) {
	png, err := qrcode.Encode(code, qrcode.Medium, 320)
	if err != nil {
		return "", fmt.Errorf("codificar PNG: %w", err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), nil
}
