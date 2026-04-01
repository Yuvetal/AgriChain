from web3 import Web3
import json
import os

# Connect to Hardhat node
w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))

# Load contract address dynamically
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

address_path = os.path.join(BASE_DIR, "contract_address.json")

with open(address_path) as f:
    CONTRACT_ADDRESS = json.load(f)["address"]
abi_path = os.path.join(
    BASE_DIR,
    "../blockchain/artifacts/contracts/SupplyChain.sol/SupplyChain.json"
)
with open(abi_path) as f:
    contract_json = json.load(f)
    CONTRACT_ABI = contract_json["abi"]
contract = w3.eth.contract(
    address=CONTRACT_ADDRESS,
    abi=CONTRACT_ABI
)