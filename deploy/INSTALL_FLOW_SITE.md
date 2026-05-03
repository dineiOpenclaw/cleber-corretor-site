# Cléber Corretor Site - Fluxo de instalação

## O que o site é

O site é uma aplicação estática servida por um serviço leve em Node.js. Ele não tem banco próprio nem painel próprio.
Ele consome apenas a API pública do CorretorCenter-mobile.

## Ideia da instalação

A instalação foi pensada para acontecer só pelo terminal, sem editar arquivo manualmente.
O instalador pergunta os dados, grava a configuração e sobe o service sozinho.

## Fluxo recomendado

### 1) Preparar a VPS
- instalar Node.js 20+
- instalar Git
- deixar o Nginx Proxy Manager já disponível, se o domínio for usar proxy

### 2) Clonar o projeto

```bash
git clone https://github.com/dineiOpenclaw/cleber-corretor-site.git
cd cleber-corretor-site
```

### 3) Rodar o instalador do site

```bash
./scripts/install-site.sh
```

O instalador:
- valida a sintaxe do servidor
- pergunta a URL pública do site
- pergunta a URL da API do backend
- pergunta o nome do site
- grava automaticamente `.site.env`
- instala o service systemd
- sobe o site na porta padrão `8081`
- valida `/` e `/config.js`

### 4) Arquivo de service

O template fica em:

- `deploy/cleber-corretor-site.service.example`

Ele é usado pelo instalador e não precisa ser editado na mão.

### 5) Validar

```bash
curl http://127.0.0.1:8081/
curl http://127.0.0.1:8081/config.js
```

### 6) Configurar o proxy no NPM

Se o Nginx Proxy Manager estiver em Docker na mesma VPS:

- **Forward Hostname / IP:** `172.17.0.1`
- **Forward Port:** `8081`

## Observação

O `site-server.js` expõe também `config.js`, para permitir trocar a API sem editar o HTML.
