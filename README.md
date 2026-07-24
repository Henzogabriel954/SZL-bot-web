# SZL-BOT 💻🤖

O **SZL-BOT** é um bot do Discord altamente estético e focado em **Servidores de Programação e Comunidades Tech**. Ele foi gerado a partir da base do `odin-bot`, mas reformulado para atender as necessidades de desenvolvedores.

Ele possui um **Dashboard Administrativo Web** com design premium em modo escuro (neon violeta/ciano), com visualização de embeds em tempo real no estilo Discord, além de comandos slash interativos.

---

## 🚀 Principais Recursos

1. **Dashboard Web Premium (Criador de Avisos/Embeds)**:
   - Interface com design estético e futurista com cores neon, bordas translúcidas e animações suaves.
   - Editor avançado de embeds de avisos e novidades.
   - **Preview em tempo real de altíssima fidelidade** simulando o Discord Dark Mode.
   - Suporte a múltiplos campos (fields) dinâmicos, miniaturas (thumbnails), imagens principais e rodapés.
   - Envio instantâneo a partir da API para múltiplos canais salvos.

2. **Gerenciamento do Servidor Tech**:
   - Painel para configurar canais de texto padrões de **Avisos** e **Changelogs/Novidades**.
   - Integração com o **GitHub**: Defina o repositório público do seu projeto no painel para que o bot exiba estatísticas de estrelas (stars) e issues diretamente no status de presença no Discord.

3. **Status de Presença Dinâmico (Gaming & Coding Status)**:
   - O bot alterna a presença automaticamente a cada 1 minuto.
   - Se houver repositório GitHub configurado, ele busca e exibe: `Watch: ⭐ [Nome]: X stars | 🐛 Y issues`.
   - Se não houver, ele exibe status temáticos divertidos de desenvolvimento, como:
     - `Playing: Escrevendo código limpo 🚀`
     - `Playing: Corrigindo bugs no código 🐛`
     - `Watching: Ajudando desenvolvedores 💻`

4. **Comandos Slash do Discord**:
   - `/aviso [titulo] [descricao] [canal] [cor]`: Permite que administradores publiquem embeds rápidos diretamente pelo chat do Discord.
   - `/codereview [linguagem] [link] [descricao]`: Permite que membros enviem solicitações de revisão de código, abrindo automaticamente uma **Thread/Fórum de debate** na mensagem enviada.
   - `/sugestao [conteudo]`: Envia uma proposta/sugestão de código com botões interativos de votação e barra de progresso em tempo real.
   - `/sugestao-decidir [id] [decisao] [motivo]`: Permite a aprovação/rejeição das propostas, trancando a discussão e arquivando a thread associada.

---

## 🛠️ Requisitos de Instalação

1. **Node.js** (v16.11.0 ou superior recomendada)
2. Banco de dados **PostgreSQL**

---

## 📦 Como Executar o SZL-BOT

### 1. Inicializar e instalar dependências

```bash
npm install
```

### 2. Configurações (`.env`)

Crie o arquivo `.env` na raiz do projeto com as variáveis de ambiente necessárias (consulte `.env.example`).

### 3. Scripts NPM Disponíveis

Para rodar em modo de desenvolvimento (atualização automática com nodemon):
```bash
npm run dev
```

Para rodar em modo de produção:
```bash
npm run start
```

Para atualizar o banco de dados (se você editar o arquivo `prisma/schema.prisma`):
```bash
npm run prisma:push
```

Para republicar/sincronizar comandos de barra no Discord:
```bash
npm run commands:deploy
```
