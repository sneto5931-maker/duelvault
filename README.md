# DuelVault (frontend)

Banco de cartas e deck builder de Yu-Gi-Oh! em React + Vite.

    npm install
    npm run dev      # desenvolvimento
    npm run build    # gera /dist

Páginas: Início, Cartas (busca + filtros + paginação + detalhe), Deck Builder (Main/Extra/Side, máx. 3 cópias, importar/exportar .ydk, salvo no localStorage).

Backend de preços (MYP Cards): veja `server/README.md`.

Dados: API pública https://db.ygoprodeck.com/api/v7 (troque `BASE` em `src/api.js` pelo seu backend).
Obs.: a API pede que imagens sejam baixadas e servidas por você em produção, em vez de usadas direto do servidor deles.
