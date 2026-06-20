# MultiSig Vault — Decentralizovani novčanik sa višestrukim potpisima

Decentralizovana aplikacija (DApp) koja implementira **M-of-N multisignature novčanik** na Ethereum blockchainu. Transakcija se izvršava tek kada je odobri minimalni unapred definisani broj vlasnika (M od ukupno N), čime se eliminiše jedinstvena tačka otkaza i znatno otežava zloupotreba ili krađa sredstava.

---

## Sadržaj

- [Pregled](#pregled)
- [Arhitektura projekta](#arhitektura-projekta)
- [Pametni ugovor](#pametni-ugovor)
- [Bezbednosni mehanizmi](#bezbednosni-mehanizmi)
- [Frontend aplikacija](#frontend-aplikacija)
- [Pokretanje projekta](#pokretanje-projekta)
- [Testiranje](#testiranje)

---

## Pregled

Umesto da jedan privatni ključ ima potpunu kontrolu nad sredstvima, ovlašćenje se deli između više učesnika. Svaka transakcija mora proći kroz proces predlaganja i prikupljanja odobrenja - tek kada broj odobrenja dostigne prag M, transakcija se automatski izvršava.

**Primer:** novčanik sa 3 vlasnika i pragom M=2 zahteva da bilo koja 2 od 3 vlasnika odobre transakciju pre nego što se izvrši.

---

## Arhitektura projekta

```
projekat-multisig/
├── multisig-wallet/          # React frontend (Vite)
│   └── src/
│       ├── App.jsx           # Glavna komponenta, Web3 integracija
│       ├── App.css           # Stilovi
│       ├── main.jsx          
│       └── contractABI.json  # ABI pametnog ugovora
│
└── hardhat/                  # Hardhat okruženje
    ├── contracts/
    │   ├── MultiSigWallet.sol    # Glavni pametni ugovor
    │   └── ReentrancyAttack.sol  # Pomoćni ugovor za testove
    ├── test/
    │   └── MultiSigWallet_test.js
    └── hardhat.config.js
```

---

## Pametni ugovor

`MultiSigWallet.sol` implementira sledeću logiku:

### Strukture i stanje

- `owners` - lista ovlašćenih vlasnika
- `isOwner` - mapping za O(1) proveru vlasništva
- `required` - prag M (minimalni broj odobrenja)
- `transactions` - niz predloženih transakcija (`to`, `value`, `data`, `executed`, `approvalCount`, `timestamp`)
- `approvals` - dvostruki mapping `txId => owner => bool`

### Funkcije

| Funkcija | Opis |
|---|---|
| `proposeTransaction(to, value, data)` | Predlaže novu transakciju (samo vlasnici) |
| `approveTransaction(txId)` | Odobrava transakciju; automatski je izvršava kada se dostigne prag M |
| `revokeApproval(txId)` | Opoziva prethodno dato odobrenje |
| `addOwner(address)` | Dodaje vlasnika - mora proći kroz multisig |
| `removeOwner(address)` | Uklanja vlasnika - mora proći kroz multisig |
| `changeRequired(M)` | Menja prag - mora proći kroz multisig |
| `getOwners()` | Vraća listu vlasnika |
| `getTransactionCount()` | Vraća ukupan broj transakcija |

### Emitovani događaji

```solidity
event Deposit(address indexed sender, uint amount);
event TransactionProposed(uint indexed txId, address indexed proposer, address to, uint value, uint timestamp);
event TransactionApproved(uint indexed txId, address indexed owner, uint timestamp);
event ApprovalRevoked(uint indexed txId, address indexed owner, uint timestamp);
event TransactionExecuted(uint indexed txId, uint timestamp);
event OwnerAdded(address indexed owner);
event OwnerRemoved(address indexed owner);
event RequiredChanged(uint required);
```

Svi zapisi su vremenski obeleženi (`block.timestamp`) i javno proverljivi na blockchainu.

---

## Bezbednosni mehanizmi

### Checks-Effects-Interactions obrazac (zaštita od reentrancy)

Pre slanja ETH-a, stanje ugovora se ažurira (`executed = true`), što sprečava ponovni ulazak:

```solidity
transaction.executed = true;  // prvo menjamo stanje
(bool success, ) = transaction.to.call{value: transaction.value}(transaction.data);
require(success, "Transaction failed");
```

Efikasnost ovog mehanizma verifikovana je testom koji deployuje `ReentrancyAttack.sol` - zlonamerni ugovor pokušava ponovo da odobri istu transakciju u `receive()` funkciji, ali poziv biva odbijen jer je `executed` već `true`.

### Zaštita od dvostrukog odobrenja

Modifier `notApproved` sprečava da isti vlasnik odobri transakciju više puta.

### Governance kroz multisig

Funkcije `addOwner`, `removeOwner` i `changeRequired` zaštićene su modifierom `onlyWallet` - mogu se pozvati isključivo kao rezultat izvršenja multisig transakcije (`address(this).call(...)`), ne direktno od strane bilo kog vlasnika.

### ECDSA autorizacija

Svaka akcija (predlaganje, odobravanje, opoziv) potpisuje se privatnim ključem vlasnika putem MetaMask-a. Ethereum protokol verifikuje potpis i identifikuje `msg.sender`, a ugovor proverava da li je ta adresa ovlašćeni vlasnik.

---

## Frontend aplikacija

React aplikacija (Vite) integrisana sa Web3.js i MetaMask-om.

### Funkcionalnosti

- **Poveži novčanik** - konekcija sa MetaMask-om, automatska detekcija mreže
- **Pregled transakcija** - lista svih predloženih i izvršenih transakcija sa progress barom odobrenja
- **Predloži transakciju** - forma za unos primaoca, iznosa i opcionih podataka
- **Odobri / Opozovi odobrenje** - jednim klikom, potpis ide kroz MetaMask
- **Uplata ETH** - direktna uplata na adresu ugovora
- **Pregled vlasnika** - lista vlasnika sa istaknutim trenutnim korisnikom

### Konfiguracija

U `src/App.jsx` promeniti adresu ugovora na sopstvenu deployovanu adresu:

```js
const CONTRACT_ADDRESS = "0x97CCd23BE42c0393aa1Edd48947c43143ae533CD";
```

---

## Pokretanje projekta

### Preduslovi

- Node.js v18+
- MetaMask ekstenzija u browseru
- Testni ETH na Sepolia mreži

### Frontend

```bash
cd multisig-wallet
npm install
npm run dev
```

Otvori `http://localhost:5173`, poveži MetaMask na Sepolia testnu mrežu i klikni "Poveži novčanik".

### Hardhat okruženje

```bash
cd hardhat
npm install
npx hardhat compile
npx hardhat test
```

---

## Testiranje

Testovi pokrivaju sve ključne scenarije:

| Kategorija | Testirani scenariji |
|---|---|
| **Deployment** | Ispravno čuvanje vlasnika i praga, validacija parametara (prazan niz, prag 0, prag > N, duplikati, nulta adresa) |
| **Deposit** | Prijem ETH, emitovanje `Deposit` eventa, ažuriranje balansa |
| **Predlaganje** | Vlasnik može predložiti, ne-vlasnik ne može, ispravno čuvanje podataka, brojač transakcija |
| **Odobravanje** | Odobravanje, zaštita od dvostrukog odobrenja, odbijanje ne-vlasnika, odbijanje nepostojeće tx |
| **Izvršenje** | Automatsko izvršenje po dostizanju praga M, odbijanje pre praga (M-1), odbijanje odobrenja već izvršene tx |
| **Opoziv** | Opoziv odobrenja, sprečavanje izvršenja nakon opoziva, ponovno odobravanje nakon opoziva |
| **Governance** | Direktno odbijanje `addOwner`/`removeOwner`/`changeRequired`, izvršenje kroz multisig proces |
| **Reentrancy** | Zlonamerni ugovor ne može iskoristiti reentrancy zahvaljujući CEI obrascu |
| **Timestampi** | Sve transakcije imaju `timestamp > 0` |

### Pokretanje testova

```bash
cd hardhat
npx hardhat test
```
