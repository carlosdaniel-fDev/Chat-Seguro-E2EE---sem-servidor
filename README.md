# Chat Seguro E2EE — versão P2P (PeerJS + HTML/CSS/JS puro)

Versão 100% client-side: não existe back-end próprio para hospedar.
Toda a comunicação acontece direto entre os dois navegadores via WebRTC
(usando a biblioteca PeerJS apenas para a etapa de sinalização inicial,
através do broker público e gratuito da PeerJS — `0.peerjs.com`).

## Por que isso resolve o problema do "precisa de cartão pra hospedar"

Como não há servidor de back-end (Node/Socket.io) para manter rodando o
tempo todo, você só precisa hospedar 3 arquivos estáticos
(`index.html`, `style.css`, `app.js`). Isso pode ser feito de graça, sem
pedir cartão, em qualquer um destes serviços:

- **GitHub Pages** (recomendado — já que o projeto já está no GitHub)
- Netlify
- Vercel
- Cloudflare Pages

## Segurança / criptografia

- **Camada 1 — WebRTC/DTLS**: a conexão peer-to-peer em si já é criptografada nativamente pelo protocolo WebRTC.
- **Camada 2 — E2EE de aplicação**: por cima disso, o app faz uma troca de chaves ECDH (P-256) e deriva uma chave AES-GCM 256 exclusiva da conversa (`crypto.js`). Cada mensagem é cifrada antes de ser enviada pelo `DataChannel`.
- O broker do PeerJS (servidor de sinalização) só vê metadados de conexão (quem quer falar com quem) — nunca o conteúdo das mensagens, que nem chega a passar por ele.

## Sistema de turnos

- Quem cria a sala e fica esperando (não preenche o campo "Link ou ID do outro usuário" e clica em Entrar) começa com a vez.
- Quem entra via link de convite (ou colando o ID/link de quem está esperando) se conecta e aguarda a vez ser passada.
- Botão **Passar vez** alterna o turno e avisa o outro lado em tempo real pelo próprio canal P2P.

## IDs e apelidos

- O **apelido** é só o nome de exibição, escolhido por você (editável, com botão 🎲 para gerar outro).
- O **ID técnico de conexão** é gerado automaticamente pelo PeerJS assim que você clica em "Entrar no chat" — isso evita o erro de "ID já em uso" que acontecia quando o ID era escolhido manualmente.
- O link de convite (botão 🔗, disponível depois que você entra) usa esse ID técnico — você não precisa nem ver ou digitar ele manualmente.

## Link de convite

Ao clicar em **🔗 Copiar link de convite**, é gerado um link tipo:
```
https://seudominio.github.io/seurepo/?to=SeuID
```
Quem abre esse link já entra com o campo "ID do outro usuário" preenchido automaticamente.

> Importante: para a conexão funcionar, **quem gerou o link precisa estar com a aba aberta esperando** (na tela de chat, "Aguardando outro usuário entrar..."), porque a conexão P2P só se estabelece se as duas pessoas estiverem com a página aberta ao mesmo tempo.

## Como hospedar no GitHub Pages (grátis, sem cartão)

1. Copie os arquivos `index.html`, `style.css`, `app.js`, `crypto.js` para o seu repositório no GitHub (pode ser na raiz, ou em uma pasta tipo `/docs`).
2. No GitHub, vá em **Settings** → **Pages**.
3. Em **Source**, selecione a branch (ex.: `main`) e a pasta (`/root` ou `/docs`, dependendo de onde você colocou os arquivos).
4. Clique em **Save**.
5. Em 1–2 minutos, o GitHub te dá uma URL tipo `https://seuusuario.github.io/seurepo/`. Essa é o link que você compartilha.

## Limitações desta versão P2P (vs. a versão com back-end)

- **Os dois precisam estar online ao mesmo tempo** para conectar (não tem histórico salvo em servidor, nem fila de mensagens offline).
- Em redes muito restritivas (firewalls corporativos, certas redes 4G/NAT simétrico), o WebRTC pode falhar em conectar diretamente sem um servidor TURN (que normalmente é pago). Na grande maioria das redes domésticas/wifi/4G comuns funciona sem problema.
- A senha de sala é uma verificação simples trocada na conexão (não é criptografia adicional) — serve para impedir que outra pessoa tente se conectar à sua sala sabendo seu ID.
