// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IMultiSig {
    function approveTransaction(uint _txId) external;
}

/**
 * @dev Napadački ugovor za reentrancy test.
 *      Kada primi ETH, pokušava ponovo da izvrši isti tx (txId = 0).
 *      Zahvaljujući checks-effects-interactions obrascu u MultiSigWallet,
 *      poziv će biti odbijen jer je executed već true.
 */
contract ReentrancyAttack {
    address public wallet;
    uint public attackCount;

    constructor(address _wallet) {
        wallet = _wallet;
    }

    receive() external payable {
        attackCount++;
        if (attackCount < 3) {
            // Pokušaj ponovnog odobravanja/izvršavanja — treba da failuje
            try IMultiSig(wallet).approveTransaction(0) {} catch {}
        }
    }
}
