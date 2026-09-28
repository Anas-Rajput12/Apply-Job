import os
import smtplib

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

load_dotenv()


SMTP_HOST = os.getenv(
    "SMTP_HOST",
    "smtp.gmail.com",
)

SMTP_PORT = int(
    os.getenv(
        "SMTP_PORT",
        "587",
    )
)

SMTP_EMAIL = os.getenv(
    "SMTP_EMAIL",
    "",
).strip()

SMTP_PASSWORD = os.getenv(
    "SMTP_PASSWORD",
    "",
).strip()


# =========================================================
# SEND GENERIC EMAIL
# =========================================================

def send_email(
    to_email: str,
    subject: str,
    html_content: str,
):
    """
    Send an HTML email through Gmail SMTP.
    """

    if not SMTP_EMAIL:
        raise RuntimeError(
            "SMTP_EMAIL is not configured in .env"
        )

    if not SMTP_PASSWORD:
        raise RuntimeError(
            "SMTP_PASSWORD is not configured in .env"
        )

    message = MIMEMultipart("alternative")

    message["From"] = SMTP_EMAIL
    message["To"] = to_email
    message["Subject"] = subject

    plain_text = (
        "Please open this email in an HTML-compatible "
        "email application."
    )

    message.attach(
        MIMEText(
            plain_text,
            "plain",
        )
    )

    message.attach(
        MIMEText(
            html_content,
            "html",
        )
    )

    try:

        print(
            f"Sending email from {SMTP_EMAIL} "
            f"to {to_email}"
        )

        with smtplib.SMTP(
            SMTP_HOST,
            SMTP_PORT,
            timeout=30,
        ) as server:

            server.ehlo()

            server.starttls()

            server.ehlo()

            server.login(
                SMTP_EMAIL,
                SMTP_PASSWORD,
            )

            server.sendmail(
                SMTP_EMAIL,
                to_email,
                message.as_string(),
            )

        print(
            f"EMAIL SENT SUCCESSFULLY -> {to_email}"
        )

    except smtplib.SMTPAuthenticationError as e:

        print(
            "GMAIL AUTHENTICATION ERROR:",
            repr(e),
        )

        raise RuntimeError(
            "Gmail authentication failed. "
            "Check your Gmail App Password."
        )

    except Exception as e:

        print(
            "EMAIL SEND ERROR:",
            repr(e),
        )

        raise RuntimeError(
            f"Email could not be sent: {str(e)}"
        )


# =========================================================
# VERIFICATION EMAIL
# =========================================================

def send_verification_email(
    to_email: str,
    code: str,
):
    subject = "Verify your ApplyAI account"

    html = f"""
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>
Verify ApplyAI Account
</title>

</head>

<body style="
    margin:0;
    padding:0;
    background:#f4f7fb;
    font-family:Arial,Helvetica,sans-serif;
">

<div style="
    max-width:600px;
    margin:40px auto;
    background:#ffffff;
    border-radius:16px;
    padding:40px;
    box-shadow:0 4px 20px rgba(0,0,0,0.08);
">

<h1 style="
    margin:0 0 10px;
    color:#111827;
    font-size:28px;
">
ApplyAI
</h1>

<h2 style="
    color:#111827;
">
Verify your email
</h2>

<p style="
    color:#4b5563;
    font-size:16px;
    line-height:1.6;
">

Thank you for creating your ApplyAI account.

Use the verification code below to verify your
email address.

</p>

<div style="
    margin:30px 0;
    padding:25px;
    background:#f3f4f6;
    border-radius:12px;
    text-align:center;
">

<div style="
    color:#6b7280;
    font-size:13px;
    margin-bottom:10px;
    text-transform:uppercase;
    letter-spacing:1px;
">

Verification Code

</div>

<div style="
    font-size:38px;
    font-weight:bold;
    letter-spacing:8px;
    color:#111827;
">

{code}

</div>

</div>

<p style="
    color:#6b7280;
    font-size:14px;
    line-height:1.6;
">

If you did not create this account,
you can safely ignore this email.

</p>

<hr style="
    border:none;
    border-top:1px solid #e5e7eb;
    margin:30px 0;
">

<p style="
    color:#9ca3af;
    font-size:12px;
    text-align:center;
">

© ApplyAI. All rights reserved.

</p>

</div>

</body>

</html>
"""

    send_email(
        to_email=to_email,
        subject=subject,
        html_content=html,
    )


# =========================================================
# PASSWORD RESET EMAIL
# =========================================================

def send_password_reset_email(
    to_email: str,
    code: str,
):
    subject = "Your ApplyAI password reset code"

    html = f"""
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>
Reset ApplyAI Password
</title>

</head>

<body style="
    margin:0;
    padding:0;
    background:#f4f7fb;
    font-family:Arial,Helvetica,sans-serif;
">

<div style="
    max-width:600px;
    margin:40px auto;
    background:#ffffff;
    border-radius:16px;
    padding:40px;
    box-shadow:0 4px 20px rgba(0,0,0,0.08);
">

<h1 style="
    margin:0 0 10px;
    color:#111827;
    font-size:28px;
">

ApplyAI

</h1>

<h2 style="
    color:#111827;
">

Reset your password

</h2>

<p style="
    color:#4b5563;
    font-size:16px;
    line-height:1.6;
">

We received a request to reset your
ApplyAI password.

Use the code below to continue.

</p>

<div style="
    margin:30px 0;
    padding:25px;
    background:#f3f4f6;
    border-radius:12px;
    text-align:center;
">

<div style="
    color:#6b7280;
    font-size:13px;
    margin-bottom:10px;
    text-transform:uppercase;
    letter-spacing:1px;
">

Password Reset Code

</div>

<div style="
    font-size:38px;
    font-weight:bold;
    letter-spacing:8px;
    color:#111827;
">

{code}

</div>

</div>

<p style="
    color:#6b7280;
    font-size:14px;
    line-height:1.6;
">

If you did not request a password reset,
you can safely ignore this email.

</p>

<hr style="
    border:none;
    border-top:1px solid #e5e7eb;
    margin:30px 0;
">

<p style="
    color:#9ca3af;
    font-size:12px;
    text-align:center;
">

© ApplyAI. All rights reserved.

</p>

</div>

</body>

</html>
"""

    send_email(
        to_email=to_email,
        subject=subject,
        html_content=html,
    )