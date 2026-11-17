# DuelVault – backend (preços do MYP Cards)

Servidor Express que consulta o MYP Cards **por você**, guarda o token, associa as cartas do
YGOPRODeck aos produtos do MYP e usa cache para respeitar os limites da API.

## Rodar

    cd server
    npm install
    cp .env.example .env        # no Windows: copy .env.example .env
    # edite o .env e coloque MYP_API_TOKEN (e, se quiser, ADMIN_KEY)
    npm start                   # http://localhost:3001/api
    npm test                    # 22 testes (usam um MYP simulado, não gastam sua cota)

Na raiz do projeto: `npm run dev` (frontend com proxy de /api) **ou** `npm run build` e depois
`npm start` dentro de `server/`: o backend também serve o site compilado, então **um único
`cloudflared tunnel --url http://localhost:3001`** expõe tudo.

## 1) Proteção do token
- O token só existe em `server/.env` (já no `.gitignore`) e só é enviado ao MYP no header `X-Api-Token`.
- O navegador fala apenas com `/api/*` do seu servidor; nenhuma resposta contém o token, e erros do
  upstream são traduzidos (sem URL/corpo do MYP).
- `/api/admin/*` exige `X-Admin-Key` (comparação em tempo constante) e fica desligado sem `ADMIN_KEY`.
- O histórico só aceita produtos do vínculo da carta (não é proxy aberto) e todos os IDs são validados.
- Sem token a API do MYP continua funcionando, só com limite menor (10/min em vez de 60/min).

## 2) Associação YGOPRODeck ↔ MYP Cards
1. Busca a carta no YGOPRODeck pelo ID (nome + sets, ex.: `LOB-EN005`).
2. Consulta `/yugioh/carta/{nome}` no MYP (nome exato) → todas as impressões, já com preço.
3. Confere o nome (sem caixa/acento) e o jogo (`id_marca = 3`).
4. Liga cada set do YGOPRODeck à impressão do MYP pelo código normalizado (`LOB-EN005` ≡ `LOB-005`).
5. Grava o vínculo em `data/mapping.json` (`matched` / `not_found`, `productIds`, `setLinks`, impressões sem par).

Quando os nomes diferem entre os catálogos, corrija manualmente (ver `data/overrides.json`):

    GET  /api/admin/unmatched                      # cartas sem vínculo
    PUT  /api/admin/mapping/{ygoId}   {"mypName":"Nome exato no MYP"}
    PUT  /api/admin/mapping/{ygoId}   {"internalCodes":[123,456]}
    PUT  /api/admin/mapping/{ygoId}   null          # remove a correção
    (header X-Admin-Key: <sua chave>)

## 3) Cache e limites
| Camada | Regra |
|---|---|
| Preço da carta | fresco 30 min · serve velho por até 2 h atualizando em segundo plano · serve velho até 24 h se o MYP cair |
| Não encontrado | cache negativo de 6 h |
| Histórico | 6 h |
| Dados do YGOPRODeck | 7 dias |
| Requisições iguais ao mesmo tempo | viram **uma** só (coalescência) |
| Persistência | `data/cache.json` e `data/mapping.json` sobrevivem a reinícios |
| Saída para o MYP | fila **por rota**, usa 90% do limite oficial (54/min com token, 9/min sem), lê `X-Rate-Limit-*`, pausa 60 s em 429 e tenta de novo uma vez |
| Fila grande | responde 503 + `Retry-After` em vez de empilhar |
| Entrada (seu servidor) | 300 req/min por IP |

## Rotas
    GET /api/health
    GET /api/prices/{ygoId}              preço + impressões + vínculo
    GET /api/prices?ids=1,2,3            lote (até 30), resposta por item: ok | pending | not_found | error
    GET /api/prices/{ygoId}/history?product={internal_code}
    GET /api/admin/stats                 cache, vínculos e fila de saída

## Atribuição (obrigatória)
Os termos do MYP Cards exigem exibir, de forma visível, que os preços vêm deles, com link para
https://mypcards.com. O frontend já faz isso no modal da carta e no rodapé; mantenha ao alterar a interface.
