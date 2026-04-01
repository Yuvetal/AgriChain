import json
import os
from config import w3, CONTRACT_ADDRESS

def get_contract():
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    abi_path = os.path.join(
        BASE_DIR,
        "..",
        "blockchain",
        "artifacts",
        "contracts",
        "SupplyChain.sol",
        "SupplyChain.json"
    )

    with open(abi_path) as f:
        contract_json = json.load(f)
        abi = contract_json["abi"]

    contract = w3.eth.contract(
        address=CONTRACT_ADDRESS,
        abi=abi
    )

    return contract