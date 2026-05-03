# Cléber Corretor Site

Site institucional, vinculado ao corretor center. Vitrine publica que atualiza em tempo real, com dados cadastrados no corretor center.

O site é separado do `corretorcenter-mobile` e roda como uma aplicação estática a parte do Corretor Center.
Ele consome somente a API pública do Corretor center (Dominio usado pelo painel do corretor center).

## Requisitos
- Corretor Center instalado na mesma vps ou outra vps
- Node.js 20+ 
- Git
- Nginx Proxy Manager em Docker, se for publicar por domínio/subdomínio
- A API pública do `Corretor Center` acessível pela internet ou pela rede definida (Dominio usado pelo painel do corretor center)

## Variáveis de ambiente

O servidor do site lê estas variáveis:

- `PORT` — porta do site, padrão `8081`
- `HOST` — host de escuta, padrão `0.0.0.0`
- `CC_SITE_ORIGIN` — URL pública do site (seuDominio.com.br)
- `CC_API_BASE` — base da API pública do backend (painel.seudominio.com.br)
- `CC_SITE_NAME` — nome exibido no log (sua marca)

## Instalação em outra VPS

A instalação foi pensada para ser feita só pelo terminal, sem editar arquivo na mão.

### Fluxo padrão

```bash
clonar o repositorio github:

git clone https://github.com/dineiOpenclaw/cleber-corretor-site.git
entrar na pasta clonada:

cd cleber-corretor-site
rodar script instalação:

./scripts/install-site.sh

O instalador:
- pergunta no terminal a URL pública do site (nomeDoSeuSite.com.br)
- pergunta a URL da API do backend (dominio do painel: painel.seudominio.com.br)
- pergunta o nome do site (nome da marca, usado somente em arquivos de Log do sistema)
- grava automaticamente `.site.env`
- verifica e libera a porta `8081/tcp` no firewall quando houver `ufw` ou `firewalld`
- instala o service systemd
- sobe o site na porta padrão `8081`
- valida `/` e `/config.js`

## Arquivo de service

O arquivo `deploy/cleber-corretor-site.service.example` é um template usado pelo instalador.
Ele não precisa ser editado manualmente.

## Nginx Proxy Manager

Se o Nginx Proxy Manager estiver em Docker na mesma VPS e o site rodar no host, use como upstream:

- **Forward Hostname / IP:** `172.17.0.1`
- **Forward Port:** `8081`
- Não use `127.0.0.1` ou IP publico da vps nesse caso, porque dentro do container ele aponta para o próprio NPM.

Se o Nginx Proxy Manager estiver em Docker em outra VPS, diferente do site, use como upstream:

- **Forward Hostname / IP:** `IP_PUBLICO_DA VPS`
- **Forward Port:** `8081`

## Como funciona a integração

O `site-server.js` expõe um arquivo virtual `config.js` com:

- `window.CC_SITE_ORIGIN` (nomeDoSeuSite.com.br)
- `window.CC_API_BASE`    (painel.seuDominio.com.br)
- `window.CC_SITE_NAME`   (Sua marca)

Assim o site pode trocar a base da API (dominio do painel corretor center) sem editar o HTML.

## Fluxo de atualização
1. entrar na pasta do projeto
   cd /home/ubuntu/cleber-corretor-site
2. atualizar o repositório
   git pull
3. rodar o instalador de novo, se houver mudança de configuração
   ./scripts/install-site.sh

## Observação importante

Este site **não** possui banco próprio.
Ele depende apenas da API pública do `corretorcenter-mobile`. (dominio do painel: painel.seuDominio.com)
