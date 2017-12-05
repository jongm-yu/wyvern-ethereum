/* global artifacts:false, it:false, contract:false, assert:false */

const bitcoin = require('bitcoinjs-lib')
const bs58check = require('bs58check')
const { ecsign, pubToAddress } = require('ethereumjs-util')

const { utxoMerkleTree, utxoAmount, utxoSet, hashUTXO, network } = require('./aux.js')

const WyvernToken = artifacts.require('WyvernToken')

const boundedRandom = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const range = (start, length) => {
  var arr = []
  for (var i = 0; i < length; i++) {
    arr.push(start + i)
  }
  return arr
}

const randomUTXO = () => utxoSet[boundedRandom(0, utxoSet.length - 1)]

contract('WyvernToken', (accounts) => {
  it('should deploy with zero tokens redeemed', () => {
    return WyvernToken
      .deployed(utxoMerkleTree.getHexRoot())
      .then(instance => {
        return instance.totalRedeemed.call()
      })
      .then(total => {
        assert.equal(0, total, 'Total was nonzero!')
      })
  })

  it('should deploy with correct redeemable', () => {
    return WyvernToken
      .deployed()
      .then(instance => {
        return instance.maximumRedeemable.call()
      })
      .then(redeemable => {
        redeemable = redeemable.div(Math.pow(10, 11)).toNumber()
        assert.equal(redeemable, utxoAmount, 'Redeemable was incorrect!')
      })
  })

  range(0, 10).map(index => {
    it('should accept valid Merkle proof of random UTXO (#' + index + ' of 10)', () => {
      const utxo = randomUTXO()
      const hash = hashUTXO(utxo)
      const proof = utxoMerkleTree.getHexProof(Buffer.from(hash.slice(2), 'hex'))

      return WyvernToken
        .deployed()
        .then(instance => {
          return instance.verifyProof.call(proof, hash)
        })
        .then(valid => {
          assert.equal(valid, true, 'Proof was not accepted')
        })
    })
  })

  range(0, 10).map(index => {
    it('should reject invalid Merkle proof of random UTXO (#' + index + 'of 10)', () => {
      const utxo = randomUTXO()
      const hash = hashUTXO(utxo)
      var proof = utxoMerkleTree.getHexProof(Buffer.from(hash.slice(2), 'hex'))
      proof = proof.slice(32, proof.length - 32)

      return WyvernToken
        .deployed()
        .then(instance => {
          return instance.verifyProof.call(proof, hash)
        })
        .then(valid => {
          assert.equal(valid, false, 'Proof was not rejected')
        })
    })
  })

  range(0, 10).map(index => {
    it('should validate random UTXO (#' + index + ' of 10)', () => {
      const utxo = randomUTXO()
      const hash = hashUTXO(utxo)
      const proof = utxoMerkleTree.getHexProof(Buffer.from(hash.slice(2), 'hex'))
      const rawAddr = bs58check.decode(utxo.address).slice(1, 21).toString('hex')

      return WyvernToken
        .deployed()
        .then(instance => {
          return instance.verifyUTXO.call('0x' + utxo.txid, '0x' + rawAddr, utxo.outputIndex, utxo.satoshis, proof)
        })
        .then(valid => {
          assert.equal(valid, true, 'UTXO was not accepted')
        })
    })
  })

  range(0, 10).map(index => {
    it('should reject invalid UTXO (#' + index + ' of 10)', () => {
      const utxo = randomUTXO()
      const hash = hashUTXO(utxo)
      const proof = utxoMerkleTree.getHexProof(Buffer.from(hash.slice(2), 'hex'))
      const rawAddr = bs58check.decode(utxo.address).slice(1, 21).toString('hex')

      return WyvernToken
        .deployed()
        .then(instance => {
          return instance.verifyUTXO.call('0x' + utxo.txid, '0x' + rawAddr, utxo.outputIndex, utxo.satoshis + 1, proof)
        })
        .then(valid => {
          assert.equal(valid, false, 'UTXO was not rejected')
        })
    })
  })

  it('should credit valid UTXO', () => {
    const utxo = utxoSet[35997]
    const hash = hashUTXO(utxo)
    const proof = utxoMerkleTree.getHexProof(Buffer.from(hash.slice(2), 'hex'))
    const keyPair = bitcoin.ECPair.fromWIF('WsUAyHvNaCyEcK8bFvzENF8wQe9zumSpJQbqMjmkwtDeYo4cqVsp', network)
    const ethAddr = accounts[0].slice(2)
    const hashBuf = bitcoin.crypto.sha256(Buffer.from(ethAddr, 'hex'))
    var { r, s, v } = ecsign(hashBuf, keyPair.d.toBuffer())
    r = '0x' + r.toString('hex')
    s = '0x' + s.toString('hex')
    const pubKey = '0x' + keyPair.Q.affineX.toBuffer(32).toString('hex') + keyPair.Q.affineY.toBuffer(32).toString('hex')

    return WyvernToken
      .deployed()
      .then(instance => {
        return instance.redeemUTXO.call('0x' + utxo.txid, utxo.outputIndex, utxo.satoshis, proof, pubKey, v, r, s)
          .then(amount => {
            amount = amount.toNumber()
            assert.equal(amount, utxo.satoshis * Math.pow(10, 11), 'UTXO was not credited correctly!')
          })
      })
  })

  it('should credit valid UTXO only once', () => {
    const utxo = utxoSet[35997]
    const hash = hashUTXO(utxo)
    const proof = utxoMerkleTree.getHexProof(Buffer.from(hash.slice(2), 'hex'))
    const keyPair = bitcoin.ECPair.fromWIF('WsUAyHvNaCyEcK8bFvzENF8wQe9zumSpJQbqMjmkwtDeYo4cqVsp', network)
    const ethAddr = accounts[0].slice(2)
    const hashBuf = bitcoin.crypto.sha256(Buffer.from(ethAddr, 'hex'))
    var { r, s, v } = ecsign(hashBuf, keyPair.d.toBuffer())
    r = '0x' + r.toString('hex')
    s = '0x' + s.toString('hex')
    const pubKey = '0x' + keyPair.Q.affineX.toBuffer(32).toString('hex') + keyPair.Q.affineY.toBuffer(32).toString('hex')

    return WyvernToken
      .deployed()
      .then(instance => {
        return instance.redeemUTXO.call('0x' + utxo.txid, utxo.outputIndex, utxo.satoshis, proof, pubKey, v, r, s)
      })
      .then(() => {
        assert.equal(false, true, 'UTXO was credited twice!')
      })
      .catch(() => {
        assert.equal(true, true, 'Error not thrown')
      })
  })

  it('should not credit invalid UTXO', () => {
    const utxo = utxoSet[35997]
    const hash = hashUTXO(utxo)
    const proof = utxoMerkleTree.getHexProof(Buffer.from(hash.slice(2), 'hex'))
    const keyPair = bitcoin.ECPair.fromWIF('WsUAyHvNaCyEcK8bFvzENF8wQe9zumSpJQbqMjmkwtDeYo4cqVsp', network)
    const ethAddr = accounts[0].slice(2)
    const hashBuf = bitcoin.crypto.sha256(Buffer.from(ethAddr, 'hex'))
    var { r, s, v } = ecsign(hashBuf, keyPair.d.toBuffer())
    r = '0x' + r.toString('hex')
    s = '0x' + s.toString('hex')
    const pubKey = '0x' + keyPair.Q.affineX.toBuffer(32).toString('hex') + keyPair.Q.affineY.toBuffer(32).toString('hex')

    return WyvernToken
      .deployed()
      .then(instance => {
        return instance.redeemUTXO.call('0x' + utxo.txid, utxo.outputIndex + 1, utxo.satoshis, proof, pubKey, v, r, s)
          .then(amount => {
            assert.equal(false, true, 'UTXO was credited!')
          }).catch(() => {
            assert.equal(true, true, 'Error not thrown')
          })
      })
  })

  range(0, 10).map(index => {
    it('should correctly convert Ethereum address (#' + index + ' of 10)', () => {
      const keyPair = bitcoin.ECPair.makeRandom({ compressed: index % 2 === 0 })
      const pubKey = '0x' + keyPair.Q.affineX.toBuffer(32).toString('hex') + keyPair.Q.affineY.toBuffer(32).toString('hex')
      const ethAddr = '0x' + pubToAddress(pubKey).toString('hex')

      return WyvernToken
        .deployed()
        .then(instance => {
          return instance.pubKeyToEthereumAddress.call(pubKey)
        })
        .then(addr => {
          assert.equal(addr, ethAddr, 'Address did not match!')
        })
    })
  })

  range(0, 10).map(index => {
    it('should verify valid signature (#' + index + ' of 10)', () => {
      const keyPair = bitcoin.ECPair.makeRandom({ compressed: index % 2 === 0 })
      const ethAddr = accounts[0].slice(2)
      const hashBuf = bitcoin.crypto.sha256(Buffer.from(ethAddr, 'hex'))
      var { r, s, v } = ecsign(hashBuf, keyPair.d.toBuffer())
      r = '0x' + r.toString('hex')
      s = '0x' + s.toString('hex')
      const pubKey = '0x' + keyPair.Q.affineX.toBuffer(32).toString('hex') + keyPair.Q.affineY.toBuffer(32).toString('hex')

      return WyvernToken
        .deployed()
        .then(instance => {
          return instance.ecdsaVerify.call('0x' + ethAddr, pubKey, v, r, s)
        })
        .then(valid => {
          assert.equal(valid, true, 'Signature did not validate!')
        })
    })
  })

  range(0, 10).map(index => {
    it('should reject invalid signature (#' + index + ' of 10)', () => {
      const keyPair = bitcoin.ECPair.makeRandom({ compressed: index % 2 === 0 })
      const ethAddr = accounts[0].slice(2)
      const hashBuf = bitcoin.crypto.sha256(Buffer.from(ethAddr, 'hex'))
      var { r, s, v } = ecsign(hashBuf, keyPair.d.toBuffer())
      r = '0x' + r.toString('hex')
      s = '0x' + s.toString('hex')
      const pubKey = '0x' + keyPair.Q.affineX.toBuffer(32).toString('hex') + keyPair.Q.affineY.toBuffer(32).toString('hex')

      return WyvernToken
        .deployed()
        .then(instance => {
          return instance.ecdsaVerify.call(accounts[1], pubKey, v, r, s)
        })
        .then(valid => {
          assert.equal(valid, false, 'Signature did not invalidate!')
        })
    })
  })
})
