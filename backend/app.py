from flask import Flask, jsonify, request
from flask_cors import CORS
from twilio.rest import Client
from web3 import Web3
import os
import requests
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

# In-Memory Sandbox for public/unverified testers
# (Ensures they can still test the flow without a verified Twilio number)
simulated_codes = {}

# Personal Finance Ledger (Simulated Merchant Bank Accounts)
# Mapping: Phone Number -> {"balance_inr": X, "history": [...]}
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
            if is_valid:
                del simulated_codes[formatted_phone] # Consume code
            return jsonify({"status": "sandbox_approved", "valid": is_valid})

    except Exception as e:
        print(f"Verification Engine Error: {str(e)}")
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
    Agri-Gas ATM: Converts farmer's imaginary INR bank balance into real Sepolia ETH.
    """
    try:
        data = request.json
        phone = data.get("phone")
        farmer_address = data.get("address")
        amount_inr = float(data.get("amount_inr", 250)) # Default ₹250 for gas
        
        if not phone.startswith("+"):
            phone = f"+91{phone}"
            
        # 1. Verify INR Balance
        account = bank_accounts.get(phone, {"balance_inr": 0, "history": []})
        if account["balance_inr"] < amount_inr:
            return jsonify({"error": "Insufficient INR Balance in Passbook."}), 400
            
        # 2. On-Chain Automated GAS DROP (Admin -> Farmer)
        # Fixed Gas Drop: 0.005 ETH
        eth_drop = 0.005
        
        # Build Transaction
        nonce = w3.eth.get_transaction_count(ADMIN_ADDR)
        tx = {
            'nonce': nonce,
            'to': farmer_address,
            'value': w3.to_wei(eth_drop, 'ether'),
            'gas': 21000,
            'gasPrice': w3.eth.gas_price,
            'chainId': 11155111 # Sepolia
        }
        
        # Sign and Broadcast
        signed_tx = w3.eth.account.sign_transaction(tx, ADMIN_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        tx_hex = w3.to_hex(tx_hash)
        
        # 3. Deduct INR and Log
        bank_accounts[phone]["balance_inr"] -= amount_inr
        bank_accounts[phone]["history"].append({
            "type": "Gas Top-Up (ATM)",
            "amount": -amount_inr,
            "hash": tx_hex,
            "status": "ETH Dispatched",
            "timestamp": "Refilling Gas..."
        })
        
        return jsonify({
            "status": "success", 
            "tx_hash": tx_hex,
            "new_balance": bank_accounts[phone]["balance_inr"]
        })
        
    except Exception as e:
        print(f"Agri-Gas ATM Error: {str(e)}")
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