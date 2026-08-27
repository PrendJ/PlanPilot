# Governance, retention e AI literacy

## Ruoli interni

`SUPERADMIN` gestisce utenti, organizzazioni, workspace, ruoli, archiviazione e reporting. `SUPPORT` opera solo su metadati e membership, può verificare email, revocare sessioni e sospendere/riattivare; non accede ai contenuti delle board. `BILLING` vede dati economici Stripe salvati lato server e può gestire licenze manuali; rimborsi, annullamenti e modifiche finanziarie si effettuano esclusivamente nel Dashboard Stripe.

Un Supporto può vedere i contenuti di una sola organizzazione soltanto se un Superadmin gli trasferisce formalmente l'ownership durante l'archiviazione dell'unico owner; il trasferimento deve avere motivazione e audit.

## Retention

Archiviazione significa blocco immediato dell'accesso e delle modifiche. Dopo 30 giorni il job di retention elimina dati operativi di organizzazioni e workspace; per gli utenti disabilita e anonimizza l'account. Prima dell'eliminazione conserva un record immutabile dell'operazione e i dati economici/audit necessari, con scadenza a 10 anni. Le date e le eccezioni legali vanno riesaminate con consulenza privacy e fiscale prima del go-live.

## Uso responsabile dell'AI

L'assistente AI è identificato nella UI, produce modifiche auditabili e annullabili, e non deve essere usato per HR, valutazioni individuali, assunzione, promozione, cessazione o decisioni automatizzate ad alto impatto. Il personale interno deve attestare la lettura della pagina AI literacy prima dell'accesso operativo. La policy e la UI vanno riesaminate ad ogni variazione normativa applicabile.
