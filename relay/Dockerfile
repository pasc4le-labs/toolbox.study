# Build stage
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /relay .

# Runtime stage
FROM gcr.io/distroless/static:nonroot
COPY --from=builder /relay /relay
EXPOSE 8080
ENTRYPOINT ["/relay"]
