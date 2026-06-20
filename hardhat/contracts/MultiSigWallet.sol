// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MultiSigWallet {

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint public required; // M - potreban broj odobrenja

    struct Transaction {
        address to;
        uint value;
        bytes data;
        bool executed;
        uint approvalCount;
        uint timestamp;
    }

    Transaction[] public transactions;

    // transactionId => owner => da li je odobrio
    mapping(uint => mapping(address => bool)) public approvals;

    event Deposit(address indexed sender, uint amount);
    event TransactionProposed(uint indexed txId, address indexed proposer, address to, uint value, uint timestamp);
    event TransactionApproved(uint indexed txId, address indexed owner, uint timestamp);
    event ApprovalRevoked(uint indexed txId, address indexed owner, uint timestamp);
    event TransactionExecuted(uint indexed txId, uint timestamp);
    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);
    event RequiredChanged(uint required);

    modifier onlyOwner() {
        require(isOwner[msg.sender], "Not an owner");
        _;
    }

    // koristi se za funkcije koje mogu biti pozvane samo
    // kroz multisig izvrsenje (address(this).call(...))
    modifier onlyWallet() {
        require(msg.sender == address(this), "Only wallet itself can call this");
        _;
    }

    modifier txExists(uint _txId) {
        require(_txId < transactions.length, "Transaction does not exist");
        _;
    }

    modifier notExecuted(uint _txId) {
        require(!transactions[_txId].executed, "Transaction already executed");
        _;
    }

    modifier notApproved(uint _txId) {
        require(!approvals[_txId][msg.sender], "Already approved");
        _;
    }

    constructor(address[] memory _owners, uint _required) {
        require(_owners.length > 0, "Owners required");
        require(_required > 0 && _required <= _owners.length, "Invalid required number");

        for (uint i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "Invalid owner");
            require(!isOwner[owner], "Owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        required = _required;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    function proposeTransaction(address _to, uint _value, bytes memory _data)
        public
        onlyOwner
        returns (uint)
    {
        uint txId = transactions.length;

        transactions.push(Transaction({
            to: _to,
            value: _value,
            data: _data,
            executed: false,
            approvalCount: 0,
            timestamp: block.timestamp
        }));

        emit TransactionProposed(txId, msg.sender, _to, _value, block.timestamp);
        return txId;
    }

    function approveTransaction(uint _txId)
        public
        onlyOwner
        txExists(_txId)
        notExecuted(_txId)
        notApproved(_txId)
    {
        approvals[_txId][msg.sender] = true;
        transactions[_txId].approvalCount += 1;

        emit TransactionApproved(_txId, msg.sender, block.timestamp);

        if (transactions[_txId].approvalCount >= required) {
            executeTransaction(_txId);
        }
    }

    function revokeApproval(uint _txId)
        public
        onlyOwner
        txExists(_txId)
        notExecuted(_txId)
    {
        require(approvals[_txId][msg.sender], "Transaction not approved");

        approvals[_txId][msg.sender] = false;
        transactions[_txId].approvalCount -= 1;

        emit ApprovalRevoked(_txId, msg.sender, block.timestamp);
    }

    function executeTransaction(uint _txId)
        internal
        txExists(_txId)
        notExecuted(_txId)
    {
        Transaction storage transaction = transactions[_txId];
        require(transaction.approvalCount >= required, "Not enough approvals");

        // checks-effects-interactions: prvo menjamo stanje
        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: transaction.value}(transaction.data);
        require(success, "Transaction failed");

        emit TransactionExecuted(_txId, block.timestamp);
    }

    /* ====== Governance funkcije ======
       Mogu se izvrsiti SAMO kroz multisig proces:
       neki vlasnik mora pozvati proposeTransaction sa
       to = address(this) i data = encodeWithSignature(...)
       za jednu od ove tri funkcije, pa proci kroz odobrenja. */

    function addOwner(address _owner) public onlyWallet {
        require(_owner != address(0), "Invalid owner");
        require(!isOwner[_owner], "Already an owner");

        isOwner[_owner] = true;
        owners.push(_owner);

        emit OwnerAdded(_owner);
    }

    function removeOwner(address _owner) public onlyWallet {
        require(isOwner[_owner], "Not an owner");
        require(owners.length - 1 >= required, "Cannot go below required threshold");

        isOwner[_owner] = false;
        for (uint i = 0; i < owners.length; i++) {
            if (owners[i] == _owner) {
                owners[i] = owners[owners.length - 1];
                owners.pop();
                break;
            }
        }

        emit OwnerRemoved(_owner);
    }

    function changeRequired(uint _required) public onlyWallet {
        require(_required > 0 && _required <= owners.length, "Invalid required number");
        required = _required;

        emit RequiredChanged(_required);
    }

    function getOwners() public view returns (address[] memory) {
        return owners;
    }

    function getTransactionCount() public view returns (uint) {
        return transactions.length;
    }
}
