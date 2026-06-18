import { useState, useEffect, useCallback } from "react";
import Web3 from "web3";
import contractABI from "./contractABI.json";
import "./App.css";

const CONTRACT_ADDRESS = "0x97CCd23BE42c0393aa1Edd48947c43143ae533CD";

function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function weiToEth(wei) {
  if (!wei || wei === "0") return "0";
  return (Number(wei) / 1e18).toFixed(6);
}

function formatTime(ts) {
  if (!ts || ts === "0") return "—";
  return new Date(Number(ts) * 1000).toLocaleString();
}

export default function App() {
  const [web3, setWeb3] = useState(null);
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [owners, setOwners] = useState([]);
  const [required, setRequired] = useState(0);
  const [balance, setBalance] = useState("0");
  const [transactions, setTransactions] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("transactions");

  // Propose form
  const [proposeTo, setProposeTo] = useState("");
  const [proposeValue, setProposeValue] = useState("");
  const [proposeData, setProposeData] = useState("0x");

  // Deposit form
  const [depositAmount, setDepositAmount] = useState("");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const connectWallet = async () => {
    if (!window.ethereum)
      return showToast("MetaMask nije instaliran!", "error");
    try {
      const w3 = new Web3(window.ethereum);
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const accounts = await w3.eth.getAccounts();
      const ct = new w3.eth.Contract(contractABI, CONTRACT_ADDRESS);
      setWeb3(w3);
      setAccount(accounts[0]);
      setContract(ct);
      showToast("Novčanik povezan!");
    } catch (e) {
      showToast("Greška pri povezivanju: " + e.message, "error");
    }
  };

  const loadData = useCallback(async () => {
    if (!contract || !account) return;
    try {
      const ownersArr = await contract.methods.getOwners().call();
      const req = await contract.methods.required().call();
      const bal = await web3.eth.getBalance(CONTRACT_ADDRESS);
      const txCount = await contract.methods.getTransactionCount().call();
      const ownerCheck = await contract.methods.isOwner(account).call();

      setOwners(ownersArr);
      setRequired(Number(req));
      setBalance(bal);
      setIsOwner(ownerCheck);

      const txs = [];
      for (let i = 0; i < Number(txCount); i++) {
        const tx = await contract.methods.transactions(i).call();
        const approved = await contract.methods.approvals(i, account).call();
        txs.push({ id: i, ...tx, myApproval: approved });
      }
      setTransactions(txs.reverse());
    } catch (e) {
      showToast("Greška pri učitavanju: " + e.message, "error");
    }
  }, [contract, account, web3]);

  useEffect(() => {
    if (contract && account) loadData();
  }, [contract, account, loadData]);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length === 0) {
          setAccount("");
          setContract(null);
          setWeb3(null);
          return;
        }
        const newAccount = accounts[0];
        setAccount(newAccount);
        // ponovo kreiramo contract objekat sa novim accountom
        if (web3) {
          const ct = new web3.eth.Contract(contractABI, CONTRACT_ADDRESS);
          setContract(ct);
        }
      });
    }
  }, [web3]);

  const proposeTransaction = async () => {
    if (!proposeTo || !proposeValue)
      return showToast("Popuni sva polja!", "error");
    setLoading(true);
    try {
      const valueWei = web3.utils.toWei(proposeValue, "ether");
      await contract.methods
        .proposeTransaction(proposeTo, valueWei, proposeData || "0x")
        .send({ from: account });
      showToast("Transakcija predložena!");
      setProposeTo("");
      setProposeValue("");
      setProposeData("0x");
      await loadData();
    } catch (e) {
      showToast("Greška: " + (e.message || e), "error");
    }
    setLoading(false);
  };

  const approveTransaction = async (txId) => {
    setLoading(true);
    try {
      await contract.methods.approveTransaction(txId).send({ from: account });
      showToast("Transakcija odobrena!");
      await loadData();
    } catch (e) {
      showToast("Greška: " + (e.message || e), "error");
    }
    setLoading(false);
  };

  const revokeApproval = async (txId) => {
    setLoading(true);
    try {
      await contract.methods.revokeApproval(txId).send({ from: account });
      showToast("Odobrenje povučeno!");
      await loadData();
    } catch (e) {
      showToast("Greška: " + (e.message || e), "error");
    }
    setLoading(false);
  };

  const deposit = async () => {
    if (!depositAmount) return showToast("Unesi iznos!", "error");
    setLoading(true);
    try {
      const valueWei = web3.utils.toWei(depositAmount, "ether");
      await web3.eth.sendTransaction({
        from: account,
        to: CONTRACT_ADDRESS,
        value: valueWei,
        gas: 100000,
      });
      showToast("ETH uplaćen na novčanik!");
      setDepositAmount("");
      await loadData();
    } catch (e) {
      showToast("Greška: " + (e.message || e), "error");
    }
    setLoading(false);
  };

  const pendingCount = transactions.filter((t) => !t.executed).length;

  return (
    <div className="app">
      {toast && (
        <div className={`toast toast--${toast.type}`}>
          <span className="toast-icon">
            {toast.type === "success" ? "✓" : "✕"}
          </span>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="logo-text">
              MultiSig<span className="logo-accent">Vault</span>
            </span>
          </div>
          <div className="network-badge">
            <span className="network-dot"></span>
            Sepolia
          </div>
        </div>
        <div className="header-right">
          {account ? (
            <div className="account-pill">
              <div className="account-avatar">
                {account.slice(2, 4).toUpperCase()}
              </div>
              <span className="account-addr">{shortAddr(account)}</span>
              {isOwner && <span className="owner-badge">Vlasnik</span>}
            </div>
          ) : (
            <button className="btn btn--primary" onClick={connectWallet}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M20 12V22H4V12" />
                <path d="M22 7H2v5h20V7z" />
                <path d="M12 22V7" />
                <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
                <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
              </svg>
              Poveži novčanik
            </button>
          )}
        </div>
      </header>

      {!account ? (
        <div className="connect-screen">
          <div className="connect-card">
            <div className="connect-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1>MultiSig Vault</h1>
            <p>
              Decentralizovani novčanik sa višestrukim potpisima. Poveži
              MetaMask da pristupiš.
            </p>
            <button
              className="btn btn--primary btn--lg"
              onClick={connectWallet}
            >
              Poveži MetaMask
            </button>
            <div className="connect-info">
              <span>Ugovor: {shortAddr(CONTRACT_ADDRESS)}</span>
            </div>
          </div>
        </div>
      ) : (
        <main className="main">
          {/* STATS BAR */}
          <div className="stats-bar">
            <div className="stat-card">
              <div className="stat-label">Balans ugovora</div>
              <div className="stat-value stat-value--eth">
                {weiToEth(balance)}
                <span className="stat-unit">ETH</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Vlasnici</div>
              <div className="stat-value">{owners.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Potrebno potpisa</div>
              <div className="stat-value">
                <span className="required-m">{required}</span>
                <span className="required-sep">/</span>
                <span className="required-n">{owners.length}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Na čekanju</div>
              <div className="stat-value">
                {pendingCount > 0 ? (
                  <span className="pending-badge">{pendingCount}</span>
                ) : (
                  "0"
                )}
              </div>
            </div>
          </div>

          {/* TABS */}
          <div className="tabs">
            <button
              className={`tab ${activeTab === "transactions" ? "tab--active" : ""}`}
              onClick={() => setActiveTab("transactions")}
            >
              Transakcije
              {pendingCount > 0 && (
                <span className="tab-count">{pendingCount}</span>
              )}
            </button>
            <button
              className={`tab ${activeTab === "propose" ? "tab--active" : ""}`}
              onClick={() => setActiveTab("propose")}
            >
              Predloži
            </button>
            <button
              className={`tab ${activeTab === "deposit" ? "tab--active" : ""}`}
              onClick={() => setActiveTab("deposit")}
            >
              Uplata
            </button>
            <button
              className={`tab ${activeTab === "owners" ? "tab--active" : ""}`}
              onClick={() => setActiveTab("owners")}
            >
              Vlasnici
            </button>
            <button
              className="tab tab--refresh"
              onClick={loadData}
              title="Osveži"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
            </button>
          </div>

          {/* TRANSACTIONS TAB */}
          {activeTab === "transactions" && (
            <div className="tab-content">
              {transactions.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <p>Nema transakcija. Predloži prvu!</p>
                </div>
              ) : (
                <div className="tx-list">
                  {transactions.map((tx) => {
                    const progress =
                      (Number(tx.approvalCount) / required) * 100;
                    return (
                      <div
                        key={tx.id}
                        className={`tx-card ${tx.executed ? "tx-card--executed" : "tx-card--pending"}`}
                      >
                        <div className="tx-header">
                          <div className="tx-id">#{tx.id}</div>
                          <div
                            className={`tx-status ${tx.executed ? "tx-status--done" : "tx-status--pending"}`}
                          >
                            {tx.executed ? "Izvršena" : "Na čekanju"}
                          </div>
                        </div>

                        <div className="tx-body">
                          <div className="tx-row">
                            <span className="tx-label">Prima</span>
                            <span className="tx-mono">{tx.to}</span>
                          </div>
                          <div className="tx-row">
                            <span className="tx-label">Iznos</span>
                            <span className="tx-value-eth">
                              {weiToEth(tx.value)} ETH
                            </span>
                          </div>
                          <div className="tx-row">
                            <span className="tx-label">Vreme</span>
                            <span>{formatTime(tx.timestamp)}</span>
                          </div>
                        </div>

                        {/* APPROVAL PROGRESS */}
                        <div className="approval-section">
                          <div className="approval-header">
                            <span>Odobrenja</span>
                            <span className="approval-count">
                              <strong>{Number(tx.approvalCount)}</strong> /{" "}
                              {required}
                            </span>
                          </div>
                          <div className="progress-track">
                            <div
                              className={`progress-fill ${tx.executed ? "progress-fill--done" : ""}`}
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                            {Array.from({ length: required }).map((_, i) => (
                              <div
                                key={i}
                                className={`progress-dot ${i < Number(tx.approvalCount) ? "progress-dot--filled" : ""}`}
                                style={{
                                  left: `${((i + 1) / required) * 100}%`,
                                }}
                              />
                            ))}
                          </div>
                        </div>

                        {/* ACTIONS */}
                        {!tx.executed && isOwner && (
                          <div className="tx-actions">
                            {!tx.myApproval ? (
                              <button
                                className="btn btn--approve"
                                onClick={() => approveTransaction(tx.id)}
                                disabled={loading}
                              >
                                ✓ Odobri
                              </button>
                            ) : (
                              <button
                                className="btn btn--revoke"
                                onClick={() => revokeApproval(tx.id)}
                                disabled={loading}
                              >
                                ✕ Povuci odobrenje
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* PROPOSE TAB */}
          {activeTab === "propose" && (
            <div className="tab-content">
              {!isOwner ? (
                <div className="not-owner-msg">
                  <span>⚠️</span> Samo vlasnici mogu da predlažu transakcije.
                </div>
              ) : (
                <div className="form-card">
                  <h2 className="form-title">Nova transakcija</h2>
                  <div className="form-group">
                    <label className="form-label">Adresa primaoca</label>
                    <input
                      className="form-input"
                      placeholder="0x..."
                      value={proposeTo}
                      onChange={(e) => setProposeTo(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Iznos (ETH)</label>
                    <div className="input-with-unit">
                      <input
                        className="form-input"
                        placeholder="0.01"
                        type="number"
                        min="0"
                        step="0.001"
                        value={proposeValue}
                        onChange={(e) => setProposeValue(e.target.value)}
                      />
                      <span className="input-unit">ETH</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Podaci{" "}
                      <span className="form-label-opt">(opcionalno)</span>
                    </label>
                    <input
                      className="form-input form-input--mono"
                      placeholder="0x"
                      value={proposeData}
                      onChange={(e) => setProposeData(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn--primary btn--full"
                    onClick={proposeTransaction}
                    disabled={loading}
                  >
                    {loading ? <span className="spinner" /> : null}
                    Predloži transakciju
                  </button>
                  <p className="form-hint">
                    Transakcija će biti izvršena kada {required} od{" "}
                    {owners.length} vlasnika odobri.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* DEPOSIT TAB */}
          {activeTab === "deposit" && (
            <div className="tab-content">
              <div className="form-card">
                <h2 className="form-title">Uplata ETH</h2>
                <div className="deposit-balance">
                  <span className="deposit-balance-label">Trenutni balans</span>
                  <span className="deposit-balance-value">
                    {weiToEth(balance)} ETH
                  </span>
                </div>
                <div className="form-group">
                  <label className="form-label">Iznos za uplatu</label>
                  <div className="input-with-unit">
                    <input
                      className="form-input"
                      placeholder="0.01"
                      type="number"
                      min="0"
                      step="0.001"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                    <span className="input-unit">ETH</span>
                  </div>
                </div>
                <button
                  className="btn btn--primary btn--full"
                  onClick={deposit}
                  disabled={loading}
                >
                  {loading ? <span className="spinner" /> : null}
                  Uplati ETH
                </button>
                <div className="contract-addr-box">
                  <span className="contract-addr-label">Adresa ugovora</span>
                  <span className="contract-addr-value">
                    {CONTRACT_ADDRESS}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* OWNERS TAB */}
          {activeTab === "owners" && (
            <div className="tab-content">
              <div className="owners-card">
                <div className="owners-header">
                  <h2 className="form-title">Vlasnici novčanika</h2>
                  <div className="owners-threshold">
                    Prag: <strong>{required}</strong> / {owners.length}
                  </div>
                </div>
                <div className="owners-list">
                  {owners.map((owner, i) => (
                    <div
                      key={owner}
                      className={`owner-row ${owner.toLowerCase() === account.toLowerCase() ? "owner-row--me" : ""}`}
                    >
                      <div className="owner-index">{i + 1}</div>
                      <div className="owner-avatar-sm">
                        {owner.slice(2, 4).toUpperCase()}
                      </div>
                      <div className="owner-info">
                        <span className="owner-addr-full">{owner}</span>
                        {owner.toLowerCase() === account.toLowerCase() && (
                          <span className="owner-you">Ti</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="owners-note">
                  Promene vlasnika ili praga moraju proći kroz multisig proces.
                </div>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
