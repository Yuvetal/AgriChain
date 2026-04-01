import "./Contact.css";

export default function Contact() {
  return (
    <div className="contact-container">
      <h2>Contact Us</h2>
      <p>📧 Email: your-email@example.com</p>
      <p>📞 Phone: +91-XXXXXXXXXX</p>

      <form>
        <input type="text" placeholder="Your Name" />
        <textarea placeholder="Your Message" rows="4"></textarea>
        <button>Send</button>
      </form>
    </div>
  );
}
