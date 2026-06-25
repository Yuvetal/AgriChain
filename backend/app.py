from flask import Flask, jsonify, request
from flask_cors import CORS
from twilio.rest import Client
from web3 import Web3
import os
import requests
import json
from eth_abi import encode
from eth_utils import keccak
from eth_account.messages import encode_defunct
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# Load secret protocol keys from .env
load_dotenv()

app = Flask(__name__)
CORS(app) 

# Twilio Protocol Config
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH = os.getenv("TWILIO_AUTH_TOKEN")
VERIFY_SERVICE_SID = os.getenv("TWILIO_VERIFY_SERVICE_SID")
DEMO_PHONE = os.getenv("VERIFIED_DEMO_PHONE")

# Web3 / Agri-Gas ATM Config
ALCHEMY_RPC = os.getenv("ALCHEMY_RPC_URL")
ADMIN_KEY = os.getenv("ADMIN_PRIVATE_KEY")
ADMIN_ADDR = os.getenv("ADMIN_ADDRESS")

# IPFS Pinata Config
PINATA_API_KEY = os.getenv("PINATA_API_KEY")
PINATA_SECRET_KEY = os.getenv("PINATA_SECRET_KEY")

# Initialize Web3 & Twilio
w3 = Web3(Web3.HTTPProvider(ALCHEMY_RPC))
twilio_client = Client(TWILIO_SID, TWILIO_AUTH)

# Identity Vault Storage (The AgriVault)
# Mapping: Phone Number -> Encrypted JSON Blob
# This allows farmers to access their same account from any device
cloud_vaults = {}
simulated_codes = {}
bank_accounts = {}

# ---------- IDENTITY VERIFICATION ROUTES ----------

@app.route("/api/otp/send", methods=["POST"])
def send_otp():
    try:
        data = request.json
        phone = data.get("phone", "").replace(" ", "") # Smart Sanitization
        
        # Standardize format for comparison
        if not phone.startswith("+"):
            formatted_phone = f"+91{phone}"
        else:
            formatted_phone = phone

        # CASE A: Real Presentation Demo (Secure & Private)
        if DEMO_PHONE and formatted_phone == DEMO_PHONE:
            verification = twilio_client.verify.v2.services(VERIFY_SERVICE_SID) \
                .verifications \
                .create(to=formatted_phone, channel='sms')
            return jsonify({"status": "sent", "sid": verification.sid})
        
        # CASE B: Public Sandbox / Unverified numbers
        else:
            import random
            mock_code = str(random.randint(100000, 999999))
            simulated_codes[formatted_phone] = mock_code
            return jsonify({
                "status": "simulated", 
                "code": mock_code,
                "message": "🧪 Protocols in Sandbox Mode (Unverified Number)"
            })
            
    except Exception as e:
        print(f"Identity Gateway Error: {str(e)}")
        return jsonify({"error": str(e)}), 400

@app.route("/api/otp/verify", methods=["POST"])
def verify_otp():
    try:
        data = request.json
        phone = data.get("phone", "").replace(" ", "") # Smart Sanitization
        code = data.get("code")
        
        if not phone.startswith("+"):
            formatted_phone = f"+91{phone}"
        else:
            formatted_phone = phone

        # CASE A: Real Verification check
        if DEMO_PHONE and formatted_phone == DEMO_PHONE:
            check = twilio_client.verify.v2.services(VERIFY_SERVICE_SID) \
                .verification_checks \
                .create(to=formatted_phone, code=code)
            return jsonify({"status": "approved", "valid": (check.status == "approved")})
        
        # CASE B: Sandbox Check
        else:
            is_valid = (simulated_codes.get(formatted_phone) == str(code))
            return jsonify({"status": "approved" if is_valid else "rejected", "valid": is_valid})
            
    except Exception as e:
        print(f"Verification Engine Error: {str(e)}")
        return jsonify({"error": str(e)}), 400

# ---------- CLOUD SYNC & RECOVERY ROUTES ----------

@app.route("/api/wallet/save", methods=["POST"])
def save_wallet():
    """Backup an encrypted wallet JSON to the cloud."""
    try:
        data = request.json
        phone = data.get("phone", "").replace(" ", "")
        encrypted_json = data.get("encrypted_json")
        
        if not phone or not encrypted_json:
            return jsonify({"error": "Phone and Wallet JSON required."}), 400
            
        # Standardize phone
        if not phone.startswith("+"): 
            phone = f"+91{phone}"
            
        cloud_vaults[phone] = encrypted_json
        print(f"✅ Cloud Sync: Vault backed up for {phone}")
        return jsonify({"status": "success", "message": "Wallet backed up to AgriVault."})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/wallet/recover", methods=["POST"])
def recover_wallet():
    """Retrieve an encrypted wallet JSON after solving an OTP challenge."""
    try:
        data = request.json
        phone = data.get("phone", "").replace(" ", "")
        code = data.get("code")
        
        if not phone.startswith("+"): 
            phone = f"+91{phone}"
            
        # 1. Verify OTP first (Security Checkpoint)
        # CASE A: Real Twilio check
        is_valid = False
        if DEMO_PHONE and phone == DEMO_PHONE:
            check = twilio_client.verify.v2.services(VERIFY_SERVICE_SID) \
                .verification_checks \
                .create(to=phone, code=code)
            is_valid = (check.status == "approved")
        # CASE B: Sandbox check
        else:
            is_valid = (simulated_codes.get(phone) == str(code))
            
        if not is_valid:
            return jsonify({"error": "Security Breach: Invalid OTP. Identity recovery denied."}), 401
            
        # 2. Return the Vault
        vault = cloud_vaults.get(phone)
        if not vault:
            return jsonify({"error": "No cloud backup found for this number."}), 404
            
        return jsonify({
            "status": "success",
            "encrypted_json": vault,
            "message": "Identity retrieved from cloud. Enter PIN to localise."
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# ---------- MERCHANT BANKING & AGRI-GAS ATM ----------

@app.route("/api/bank/balance/<phone>", methods=["GET"])
def get_bank_balance(phone):
    if not phone.startswith("+"):
        phone = f"+91{phone}"
    
    account = bank_accounts.get(phone, {"balance_inr": 0, "history": []})
    return jsonify(account)

@app.route("/api/bank/withdraw", methods=["POST"])
def bank_withdrawal():
    try:
        data = request.json
        phone = data.get("phone")
        amount_inr = float(data.get("amount_inr", 0))
        tx_hash = data.get("tx_hash")

        if not phone.startswith("+"):
            phone = f"+91{phone}"

        if phone not in bank_accounts:
            bank_accounts[phone] = {"balance_inr": 0, "history": []}

        # Update the Imaginary Ledger
        bank_accounts[phone]["balance_inr"] += amount_inr
        bank_accounts[phone]["history"].append({
            "type": "Blockchain Off-Ramp",
            "amount": amount_inr,
            "hash": tx_hash,
            "status": "Success",
            "timestamp": "Real-time"
        })

        return jsonify({"status": "success", "new_balance": bank_accounts[phone]["balance_inr"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/bank/buy-gas", methods=["POST"])
def buy_gas():
    """
    Agri-Gas ATM: Deprecated in favor of EIP-4337 Account Abstraction.
    """
    return jsonify({
        "error": "The Gas ATM is deprecated. Transactions are now gasless and sponsored by the Paymaster!"
    }), 400

def load_eip4337_contract(name):
    try:
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        path_json = os.path.join(BASE_DIR, "contracts", f"{name}.json")
        if not os.path.exists(path_json):
            return None, None
        with open(path_json) as f:
            data = json.load(f)
            return data["address"], data["abi"]
    except Exception as e:
        print(f"Error loading contract {name}: {str(e)}")
        return None, None

@app.route("/api/paymaster/sign", methods=["POST"])
def sign_paymaster_op():
    try:
        data = request.json
        user_op = data.get("userOp")
        
        paymaster_address, _ = load_eip4337_contract("AgroPaymaster")
        if not paymaster_address:
            return jsonify({"error": "AgroPaymaster contract not deployed yet."}), 500
            
        # Sponsoring validity window: 1 hour
        import time
        valid_until = int(time.time()) + 3600
        valid_after = 0
        
        chain_id = w3.eth.chain_id
        
        init_code_hash = w3.keccak(hexstr=user_op['initCode'])
        call_data_hash = w3.keccak(hexstr=user_op['callData'])
        
        types = [
            'address', 'uint256', 'bytes32', 'bytes32',
            'uint256', 'uint256', 'uint256', 'uint256',
            'uint256', 'uint256', 'address', 'uint48', 'uint48'
        ]
        values = [
            w3.to_checksum_address(user_op['sender']),
            int(user_op['nonce']),
            init_code_hash,
            call_data_hash,
            int(user_op['callGasLimit']),
            int(user_op['verificationGasLimit']),
            int(user_op['preVerificationGas']),
            int(user_op['maxFeePerGas']),
            int(user_op['maxPriorityFeePerGas']),
            int(chain_id),
            w3.to_checksum_address(paymaster_address),
            int(valid_until),
            int(valid_after)
        ]
        
        encoded_data = encode(types, values)
        paymaster_hash = keccak(encoded_data)
        
        message = encode_defunct(primitive=paymaster_hash)
        signed_message = w3.eth.account.sign_message(message, private_key=ADMIN_KEY)
        signature = signed_message.signature.hex()
        
        valid_until_hex = f"{valid_until:012x}"
        valid_after_hex = f"{valid_after:012x}"
        
        sig_clean = signature[2:] if signature.startswith("0x") else signature
        paymaster_and_data = f"{paymaster_address.lower()}{valid_until_hex}{valid_after_hex}{sig_clean}"
        
        return jsonify({
            "status": "success",
            "paymasterAndData": paymaster_and_data
        })
    except Exception as e:
        print(f"Paymaster Signing Error: {str(e)}")
        return jsonify({"error": str(e)}), 400

@app.route("/api/userop/submit", methods=["POST"])
def submit_userop():
    try:
        data = request.json
        user_op = data.get("userOp")
        
        entry_point_address, entry_point_abi = load_eip4337_contract("EntryPoint")
        if not entry_point_address:
            return jsonify({"error": "EntryPoint contract not deployed yet."}), 500
            
        entry_point_contract = w3.eth.contract(address=entry_point_address, abi=entry_point_abi)
        
        user_op_tuple = (
            w3.to_checksum_address(user_op['sender']),
            int(user_op['nonce']),
            w3.to_bytes(hexstr=user_op['initCode']),
            w3.to_bytes(hexstr=user_op['callData']),
            int(user_op['callGasLimit']),
            int(user_op['verificationGasLimit']),
            int(user_op['preVerificationGas']),
            int(user_op['maxFeePerGas']),
            int(user_op['maxPriorityFeePerGas']),
            w3.to_bytes(hexstr=user_op['paymasterAndData']),
            w3.to_bytes(hexstr=user_op['signature'])
        )
        
        nonce = w3.eth.get_transaction_count(ADMIN_ADDR, 'pending')
        
        tx = entry_point_contract.functions.handleOps([user_op_tuple], w3.to_checksum_address(ADMIN_ADDR)).build_transaction({
            'from': ADMIN_ADDR,
            'nonce': nonce,
            'gas': 3000000,
            'gasPrice': w3.eth.gas_price,
            'chainId': w3.eth.chain_id
        })
        
        signed_tx = w3.eth.account.sign_transaction(tx, ADMIN_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        tx_hex = w3.to_hex(tx_hash)
        
        print(f"🚀 UserOp submitted via Relayer. Tx Hash: {tx_hex}")
        return jsonify({
            "status": "success",
            "tx_hash": tx_hex
        })
    except Exception as e:
        print(f"UserOp Submission Error: {str(e)}")
        return jsonify({"error": str(e)}), 400

@app.route("/api/ping", methods=["GET"])
def ping():
    return jsonify({"message": "AgriBank Nodes Online 🚀"})

# ---------- DECENTRALIZED STORAGE (IPFS) ----------

@app.route("/api/ipfs/upload", methods=["POST"])
def upload_to_ipfs():
    """
    Pins a video file to IPFS via Pinata.
    Expects multipart/form-data with a 'file' attribute.
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not PINATA_API_KEY or not PINATA_SECRET_KEY:
        return jsonify({"error": "IPFS Config Missing on Backend"}), 500

    filename = secure_filename(file.filename)
    
    # Save temporarily
    temp_path = os.path.join(os.environ.get('TEMP', '/tmp'), filename)
    file.save(temp_path)

    try:
        url = "https://api.pinata.cloud/pinning/pinFileToIPFS"
        headers = {
            "pinata_api_key": PINATA_API_KEY,
            "pinata_secret_api_key": PINATA_SECRET_KEY
        }
        
        with open(temp_path, 'rb') as fp:
            files = { 'file': (filename, fp) }
            response = requests.post(url, headers=headers, files=files)
            
        response_data = response.json()
        
        if response.status_code == 200 and "IpfsHash" in response_data:
            return jsonify({
                "status": "success",
                "ipfs_hash": response_data["IpfsHash"],
                "pin_size": response_data.get("PinSize")
            })
        else:
            return jsonify({"error": "Failed to pin to IPFS", "details": response_data}), 400
            
    except Exception as e:
        print(f"IPFS Upload Error: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)

# ---------- RUN SERVER ----------

if __name__ == "__main__":
    app.run(debug=True, port=5000)