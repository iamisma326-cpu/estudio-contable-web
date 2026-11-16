# Sirve igual en Railway y en Render: no hay nada específico de proveedor.
# Con WA_DB_PATH la sesión vive en un volumen SQLite; con WA_DB_URL, en Postgres.
FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# CGO es obligatorio para go-sqlite3 (la sesión en volumen).
RUN CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/whatsapp .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data
COPY --from=build /out/whatsapp /usr/local/bin/whatsapp
ENV PORT=8080
EXPOSE 8080
CMD ["whatsapp"]
