# Cléber Corretor Site - Fluxo de instalação

## O que o site é

O site é uma aplicação estática servida por um serviço leve em Node.js. Ele não tem instalador de banco nem painel próprio.
Ele consome apenas a API pública do CorretorCenter-mobile.

## Estrutura do deploy

- **Site**: `imoveis.codeflowsoluctions.com`
- **Porta do site**: `8081`
- **API do projeto**: configurada via `CC_API_BASE`
- **Nginx Proxy Manager**: aponta o subdomínio do site para o serviço na porta `8081`

## Etapas

### 1) Preparar a VPS
- Node.js 20+
- Git
- Nginx Proxy Manager já funcionando em Docker

### 2) Clonar o site
Exemplo:

```bash
git clone <repo-do-site>
cd cleber-corretor-site
```

### 3) Ajustar o serviço
Usar o arquivo:

- `deploy/cleber-corretor-site.service.example`

Ele sobe o servidor leve do site na porta `8081`.

### 4) Subir o serviço
Exemplo lógico:

```bash
sudo cp deploy/cleber-corretor-site.service.example /etc/systemd/system/cleber-corretor-site.service
sudo systemctl daemon-reload
sudo systemctl enable --now cleber-corretor-site
```

### 5) Configurar o proxy no NPM
No Nginx Proxy Manager:

- **Domínio**: `imoveis.codeflowsoluctions.com`
- **Forward Hostname / IP**: `172.17.0.1`
- **Forward Port**: `8081`

### 6) Validar
- abrir `http://127.0.0.1:8081`
- abrir `https://imoveis.codeflowsoluctions.com`
- testar Home, Destaques e Imóvel
- confirmar que os cards chamam `imovel.html?codigo=...`
- confirmar que as buscas consultam a API pública do projeto

## Observação

O arquivo `site-server.js` expõe também `config.js`, para permitir trocar a API sem editar o HTML.
