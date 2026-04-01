from config import w3
from contract import get_contract

# ---------- READ ----------

def get_batch(batch_id):
    contract = get_contract()
    batch = contract.functions.batches(batch_id).call()
    status_map = {
        0: "Created",
        1: "Sold",
        2: "Delivered",
        3: "Refunded"
    }
    return {
    "id": batch[0],
    "parentId": batch[1],
    "name": batch[2],
    "quantity": batch[3],
    "price_wei": batch[4],
    "price_eth": w3.from_wei(batch[4], "ether"),
    "escrow_wei": batch[5],
    "escrow_eth": w3.from_wei(batch[5], "ether"),
    "farmer": batch[6],
    "buyer": batch[7],
    "status": status_map.get(batch[8], "Unknown")
}


# ---------- WRITE ----------

def create_batch(address, private_key, name, quantity, price_eth, parent_id):
    contract = get_contract()
    nonce = w3.eth.get_transaction_count(address, "pending")
    try:
        tx = contract.functions.createBatch(
            name,
            quantity,
            w3.to_wei(price_eth, "ether"),
            parent_id
        ).build_transaction({
            "from": address,
            "nonce": nonce,
            "gas": 2000000,
            "gasPrice": w3.to_wei("20", "gwei"),
            "chainId": 31337
        })
    except Exception as e:
        raise Exception(f"CreateBatch failed: {str(e)}")

    return send_transaction(tx, private_key)


def purchase_batch(address, private_key, batch_id, price_eth):
    contract = get_contract()
    nonce = w3.eth.get_transaction_count(address, "pending")
    gas_estimate = contract.functions.purchaseBatch(batch_id).estimate_gas({
    "from": address,
    "value": w3.to_wei(price_eth, "ether")
    })
    try:
        tx = contract.functions.purchaseBatch(batch_id).build_transaction({
            "from": address,
            "nonce": nonce,
            "value": w3.to_wei(price_eth, "ether"),
            "gas": gas_estimate,
            "gasPrice": w3.to_wei("20", "gwei"),
            "chainId": 31337
        })
    except Exception as e:
        raise Exception(f"Purchase failed: {str(e)}")

    return send_transaction(tx, private_key)


def confirm_delivery(address, private_key, batch_id):
    contract = get_contract()
    nonce = w3.eth.get_transaction_count(address, "pending")
    gas_estimate = contract.functions.confirmDelivery(batch_id).estimate_gas({
    "from": address
    })
    try:
        tx = contract.functions.confirmDelivery(batch_id).build_transaction({
            "from": address,
            "nonce": nonce,
            "gas": gas_estimate,
            "gasPrice": w3.to_wei("20", "gwei"),
            "chainId": 31337
        })
    except Exception as e:
        raise Exception(f"ConfirmDelivery failed: {str(e)}")

    return send_transaction(tx, private_key)


def refund(address, private_key, batch_id):
    contract = get_contract()
    nonce = w3.eth.get_transaction_count(address, "pending")
    gas_estimate = contract.functions.refund(batch_id).estimate_gas({
    "from": address
    })
    try:
        tx = contract.functions.refund(batch_id).build_transaction({
            "from": address,
            "nonce": nonce,
            "gas": gas_estimate,
            "gasPrice": w3.to_wei("20", "gwei"),
            "chainId": 31337
        })
    except Exception as e:
        raise Exception(f"Refund failed: {str(e)}")

    return send_transaction(tx, private_key)

def get_batch_count():
    contract = get_contract()
    return contract.functions.batchCount().call()
def send_transaction(tx, private_key):
    try:
        signed_tx = w3.eth.account.sign_transaction(tx, private_key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)

        print(f"🚀 Transaction sent: {tx_hash.hex()}")

        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        print(f"✅ Transaction confirmed in block {receipt.blockNumber}")

        return receipt

    except Exception as e:
        print("❌ Transaction failed:", str(e))
        raise