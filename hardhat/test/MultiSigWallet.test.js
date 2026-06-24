const { expect } = require("chai");
const { ethers } = require("hardhat");

//  MultiSigWallet –  testovi 

describe("MultiSigWallet", function () {
  let wallet;
  let owner1, owner2, owner3, nonOwner, recipient;

  // Pomoćna funkcija: deployuje ugovor sa 3 vlasnika, prag = 2
  async function deployWallet(owners, required) {
    const Factory = await ethers.getContractFactory("MultiSigWallet");
    const contract = await Factory.deploy(owners, required);
    await contract.waitForDeployment();
    return contract;
  }

  beforeEach(async function () {
    [owner1, owner2, owner3, nonOwner, recipient] =
      await ethers.getSigners();

    wallet = await deployWallet(
      [owner1.address, owner2.address, owner3.address],
      2
    );
  });

  // DEPLOYMENT
  describe("Deployment", function () {
    it("ispravno čuva listu vlasnika", async function () {
      const owners = await wallet.getOwners();
      expect(owners).to.deep.equal([
        owner1.address,
        owner2.address,
        owner3.address,
      ]);
    });

    it("ispravno postavlja prag M", async function () {
      expect(await wallet.required()).to.equal(2);
    });

    it("isOwner vraća true za vlasnika", async function () {
      expect(await wallet.isOwner(owner1.address)).to.be.true;
    });

    it("isOwner vraća false za ne-vlasnika", async function () {
      expect(await wallet.isOwner(nonOwner.address)).to.be.false;
    });

    it("odbija deploy ako nema vlasnika", async function () {
      await expect(deployWallet([], 1)).to.be.revertedWith(
        "Owners required"
      );
    });

    it("odbija deploy ako je prag 0", async function () {
      await expect(
        deployWallet([owner1.address], 0)
      ).to.be.revertedWith("Invalid required number");
    });

    it("odbija deploy ako je prag veći od broja vlasnika", async function () {
      await expect(
        deployWallet([owner1.address, owner2.address], 3)
      ).to.be.revertedWith("Invalid required number");
    });

    it("odbija deploy sa duplikatom vlasnika", async function () {
      await expect(
        deployWallet([owner1.address, owner1.address], 1)
      ).to.be.revertedWith("Owner not unique");
    });

    it("odbija deploy sa nultom adresom vlasnika", async function () {
      await expect(
        deployWallet([ethers.ZeroAddress], 1)
      ).to.be.revertedWith("Invalid owner");
    });
  });

  // DEPOSIT
  describe("Deposit", function () {
    it("prima ETH i emituje Deposit event", async function () {
      const amount = ethers.parseEther("1.0");
      await expect(
        owner1.sendTransaction({ to: await wallet.getAddress(), value: amount })
      )
        .to.emit(wallet, "Deposit")
        .withArgs(owner1.address, amount);
    });

    it("balans ugovora se povećava nakon uplate", async function () {
      const amount = ethers.parseEther("0.5");
      await owner1.sendTransaction({
        to: await wallet.getAddress(),
        value: amount,
      });
      const bal = await ethers.provider.getBalance(await wallet.getAddress());
      expect(bal).to.equal(amount);
    });
  });

  // PREDLAGANJE TRANSAKCIJE
  describe("proposeTransaction", function () {
    it("vlasnik može da predloži transakciju", async function () {
      const value = ethers.parseEther("0.1");
      await expect(
        wallet
          .connect(owner1)
          .proposeTransaction(recipient.address, value, "0x")
      )
        .to.emit(wallet, "TransactionProposed")
        .withArgs(0, owner1.address, recipient.address, value, (ts) => ts > 0);
    });

    it("broji transakcije ispravno", async function () {
      await wallet
        .connect(owner1)
        .proposeTransaction(recipient.address, 0, "0x");
      await wallet
        .connect(owner2)
        .proposeTransaction(recipient.address, 0, "0x");
      expect(await wallet.getTransactionCount()).to.equal(2);
    });

    it("ne-vlasnik ne može da predloži transakciju", async function () {
      await expect(
        wallet
          .connect(nonOwner)
          .proposeTransaction(recipient.address, 0, "0x")
      ).to.be.revertedWith("Not an owner");
    });

    it("transakcija se čuva sa ispravnim podacima", async function () {
      const value = ethers.parseEther("0.2");
      await wallet
        .connect(owner1)
        .proposeTransaction(recipient.address, value, "0x");
      const tx = await wallet.transactions(0);
      expect(tx.to).to.equal(recipient.address);
      expect(tx.value).to.equal(value);
      expect(tx.executed).to.be.false;
      expect(tx.approvalCount).to.equal(0);
    });
  });

  // ODOBRAVANJE TRANSAKCIJE
  describe("approveTransaction", function () {
    beforeEach(async function () {
      // Depozit i predlog za sve testove odobrenja
      await owner1.sendTransaction({
        to: await wallet.getAddress(),
        value: ethers.parseEther("2"),
      });
      await wallet
        .connect(owner1)
        .proposeTransaction(
          recipient.address,
          ethers.parseEther("0.1"),
          "0x"
        );
    });

    it("vlasnik može da odobri transakciju", async function () {
      await expect(wallet.connect(owner1).approveTransaction(0))
        .to.emit(wallet, "TransactionApproved")
        .withArgs(0, owner1.address, (ts) => ts > 0);

      const tx = await wallet.transactions(0);
      expect(tx.approvalCount).to.equal(1);
      expect(await wallet.approvals(0, owner1.address)).to.be.true;
    });

    it("ne-vlasnik ne može da odobri", async function () {
      await expect(
        wallet.connect(nonOwner).approveTransaction(0)
      ).to.be.revertedWith("Not an owner");
    });

    it("vlasnik ne može da odobri dva puta (double-approval zaštita)", async function () {
      await wallet.connect(owner1).approveTransaction(0);
      await expect(
        wallet.connect(owner1).approveTransaction(0)
      ).to.be.revertedWith("Already approved");
    });

    it("odbija odobrenje nepostojeće transakcije", async function () {
      await expect(
        wallet.connect(owner1).approveTransaction(99)
      ).to.be.revertedWith("Transaction does not exist");
    });

    // AUTOMATSKO IZVRŠENJE PO DOSTIZANJU PRAGA
    it("izvršava transakciju kada se dostigne prag (M=2)", async function () {
      const balBefore = await ethers.provider.getBalance(recipient.address);

      await wallet.connect(owner1).approveTransaction(0);

      await expect(wallet.connect(owner2).approveTransaction(0))
        .to.emit(wallet, "TransactionExecuted")
        .withArgs(0, (ts) => ts > 0);

      const tx = await wallet.transactions(0);
      expect(tx.executed).to.be.true;

      const balAfter = await ethers.provider.getBalance(recipient.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("0.1"));
    });

    it("NE izvršava transakciju pre dostizanja praga (M-1 odobrenja)", async function () {
      await wallet.connect(owner1).approveTransaction(0);
      const tx = await wallet.transactions(0);
      expect(tx.executed).to.be.false;
    });

    it("odbija odobrenje već izvršene transakcije", async function () {
      await wallet.connect(owner1).approveTransaction(0);
      await wallet.connect(owner2).approveTransaction(0);

      // Tx je sada izvršena
      await expect(
        wallet.connect(owner3).approveTransaction(0)
      ).to.be.revertedWith("Transaction already executed");
    });
  });

  // OPOZIV ODOBRENJA
  describe("revokeApproval", function () {
    beforeEach(async function () {
      await owner1.sendTransaction({
        to: await wallet.getAddress(),
        value: ethers.parseEther("1"),
      });
      await wallet
        .connect(owner1)
        .proposeTransaction(recipient.address, ethers.parseEther("0.1"), "0x");
      await wallet.connect(owner1).approveTransaction(0);
    });

    it("vlasnik može da opozove svoje odobrenje", async function () {
      await expect(wallet.connect(owner1).revokeApproval(0))
        .to.emit(wallet, "ApprovalRevoked")
        .withArgs(0, owner1.address, (ts) => ts > 0);

      const tx = await wallet.transactions(0);
      expect(tx.approvalCount).to.equal(0);
      expect(await wallet.approvals(0, owner1.address)).to.be.false;
    });

    it("ne može opozati odobrenje koje nije dao", async function () {
      await expect(
        wallet.connect(owner2).revokeApproval(0)
      ).to.be.revertedWith("Transaction not approved");
    });

    it("opoziv sprečava izvršenje — posle opoziva fali potpis", async function () {
      await wallet.connect(owner1).revokeApproval(0);
      // Samo owner2 odobrava — prag 2, nema dovoljno
      await wallet.connect(owner2).approveTransaction(0);
      const tx = await wallet.transactions(0);
      expect(tx.executed).to.be.false;
    });

    it("vlasnik može ponovo odobriti nakon opoziva", async function () {
      await wallet.connect(owner1).revokeApproval(0);
      await wallet.connect(owner1).approveTransaction(0); // ponovo
      const tx = await wallet.transactions(0);
      expect(tx.approvalCount).to.equal(1);
    });
  });

  // GOVERNANCE – addOwner / removeOwner / changeRequired
  //     Mora proći kroz multisig (onlyWallet)
  describe("Governance (onlyWallet)", function () {
    it("addOwner direktno odbija poziv (nije kroz multisig)", async function () {
      await expect(
        wallet.connect(owner1).addOwner(nonOwner.address)
      ).to.be.revertedWith("Only wallet itself can call this");
    });

    it("removeOwner direktno odbija poziv", async function () {
      await expect(
        wallet.connect(owner1).removeOwner(owner3.address)
      ).to.be.revertedWith("Only wallet itself can call this");
    });

    it("changeRequired direktno odbija poziv", async function () {
      await expect(
        wallet.connect(owner1).changeRequired(1)
      ).to.be.revertedWith("Only wallet itself can call this");
    });

    it("addOwner prolazi kroz multisig i emituje OwnerAdded", async function () {
      const iface = wallet.interface;
      const data = iface.encodeFunctionData("addOwner", [nonOwner.address]);

      // Predloži
      await wallet
        .connect(owner1)
        .proposeTransaction(await wallet.getAddress(), 0, data);

      // Odobri (prag = 2)
      await wallet.connect(owner1).approveTransaction(0);
      await expect(wallet.connect(owner2).approveTransaction(0))
        .to.emit(wallet, "OwnerAdded")
        .withArgs(nonOwner.address);

      expect(await wallet.isOwner(nonOwner.address)).to.be.true;
      expect((await wallet.getOwners()).length).to.equal(4);
    });

    it("removeOwner prolazi kroz multisig i emituje OwnerRemoved", async function () {
      const data = wallet.interface.encodeFunctionData("removeOwner", [
        owner3.address,
      ]);

      await wallet
        .connect(owner1)
        .proposeTransaction(await wallet.getAddress(), 0, data);
      await wallet.connect(owner1).approveTransaction(0);
      await expect(wallet.connect(owner2).approveTransaction(0))
        .to.emit(wallet, "OwnerRemoved")
        .withArgs(owner3.address);

      expect(await wallet.isOwner(owner3.address)).to.be.false;
    });

    it("removeOwner odbija ako bi broj vlasnika pao ispod praga", async function () {
      // Wallet: 3 vlasnika, prag 2. Uklanjamo do 2 – OK.
      // Pokušavamo i 2. vlasnika – pada ispod praga.
      const data1 = wallet.interface.encodeFunctionData("removeOwner", [
        owner3.address,
      ]);
      await wallet
        .connect(owner1)
        .proposeTransaction(await wallet.getAddress(), 0, data1);
      await wallet.connect(owner1).approveTransaction(0);
      await wallet.connect(owner2).approveTransaction(0);
      // Sada 2 vlasnika, prag 2. Pokušaj uklanjanja jednog:
      const data2 = wallet.interface.encodeFunctionData("removeOwner", [
        owner2.address,
      ]);
      await wallet
        .connect(owner1)
        .proposeTransaction(await wallet.getAddress(), 0, data2);
      await wallet.connect(owner1).approveTransaction(1);
      // owner2 odobrava sopstveno uklanjanje (dozvoljeno), ali revert dolazi iz ugovora
      await expect(
        wallet.connect(owner2).approveTransaction(1)
      ).to.be.revertedWith("Transaction failed");
    });

    it("changeRequired prolazi kroz multisig", async function () {
      const data = wallet.interface.encodeFunctionData("changeRequired", [3]);

      await wallet
        .connect(owner1)
        .proposeTransaction(await wallet.getAddress(), 0, data);
      await wallet.connect(owner1).approveTransaction(0);
      await wallet.connect(owner2).approveTransaction(0);

      expect(await wallet.required()).to.equal(3);
    });
  });

  // REENTRANCY ZAŠTITA (checks-effects-interactions)
  describe("Reentrancy zaštita", function () {
    it("zlonamerni ugovor ne može da reentrantuje executeTransaction", async function () {
      // Deployujemo napadački ugovor
      const AttackFactory = await ethers.getContractFactory("ReentrancyAttack");
      const attack = await AttackFactory.deploy(await wallet.getAddress());
      await attack.waitForDeployment();

      // Napunimo wallet
      await owner1.sendTransaction({
        to: await wallet.getAddress(),
        value: ethers.parseEther("2"),
      });

      // Predlažemo transakciju ka napadačkom ugovoru
      await wallet
        .connect(owner1)
        .proposeTransaction(
          await attack.getAddress(),
          ethers.parseEther("0.5"),
          "0x"
        );

      await wallet.connect(owner1).approveTransaction(0);
      // Transakcija se izvršava (owner2 daje drugi potpis).
      // Napadački ugovor pokušava reentrancy u receive(), ali
      // executed = true je već postavljeno, pa neće uspeti.
      await wallet.connect(owner2).approveTransaction(0);

      const tx = await wallet.transactions(0);
      expect(tx.executed).to.be.true;
      // Napadački ugovor prima samo jednu isplatu
      const attackBal = await ethers.provider.getBalance(
        await attack.getAddress()
      );
      expect(attackBal).to.equal(ethers.parseEther("0.5"));
    });
  });

  //  9. VREMENSKI PEČATI
  describe("Vremenski pečati", function () {
    it("transakcija ima timestamp > 0", async function () {
      await wallet
        .connect(owner1)
        .proposeTransaction(recipient.address, 0, "0x");
      const tx = await wallet.transactions(0);
      expect(tx.timestamp).to.be.gt(0);
    });
  });
});
