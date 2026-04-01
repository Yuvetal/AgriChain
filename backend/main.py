import services
from config import w3

import os

def run():
    if not w3.is_connected():
        print("❌ Blockchain not connected")
        return
    else:
        print("✅ Connected to blockchain")
    
    farmer = w3.eth.accounts[0]
    farmer_private_key = os.getenv("HARDHAT_FARMER_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
    buyer = w3.eth.accounts[1]    
    buyer_private_key = os.getenv("HARDHAT_BUYER_KEY", "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d")


    name = "Carrots"
    quantity = 300
    price = 2

    print("\n--- Creating Batch ---")
    services.create_batch(farmer, farmer_private_key, name, quantity, price, 0)

    batch_id = services.get_batch_count()
    print(f"Batch ID: {batch_id}")

    print("\n--- Purchasing ---")
    services.purchase_batch(buyer,buyer_private_key, batch_id, price)

    print("\n--- Confirming Delivery ---    ")
    services.confirm_delivery(buyer,buyer_private_key, batch_id)

    print("\n--- Final State ---")
    print(services.get_batch(batch_id))


if __name__ == "__main__":
    run()