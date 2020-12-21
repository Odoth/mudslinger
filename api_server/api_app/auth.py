import functools

from flask import Blueprint
from flask import flash
from flask import g
from flask import redirect
from flask import render_template
from flask import request
from flask import session
from flask import url_for
from flask import current_app
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash
from itsdangerous import URLSafeTimedSerializer, SignatureExpired

from flask_mail import Message

from api_app.db import get_db
from api_app import mail
from api_app.forms import RegistrationForm, SetPasswordForm, LoginForm, ResetPasswordForm


bp = Blueprint("auth", __name__, url_prefix="/auth")


def login_required(view):
    """View decorator that redirects anonymous users to the login page."""

    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return redirect(url_for("auth.login"))

        return view(**kwargs)

    return wrapped_view


@bp.before_app_request
def load_logged_in_user():
    """If a user id is stored in the session, load the user object from
    the database into ``g.user``."""
    user_id = session.get("user_id")

    if user_id is None:
        g.user = None
    else:
        g.user = (
            get_db().execute("SELECT * FROM user WHERE id = ?", (user_id,)).fetchone()
        )


RESET_SALT = '-reset-'
REGISTER_SALT = '-register-'


def dump_sig(app, obj, salt):
    ser = URLSafeTimedSerializer(app.config['SECRET_KEY'], salt=salt)
    return ser.dumps(obj)


def load_sig(app, sig, max_age, salt):
    ser = URLSafeTimedSerializer(app.config['SECRET_KEY'], salt=salt)
    return ser.loads(sig, max_age=max_age)


@bp.route("/<string:sig>/reset_password", methods=("GET", "POST"))
def reset_password_confirm(sig):
    if g.user is not None:
        return redirect(url_for('user.profiles'))

    try:
        o = load_sig(current_app, sig, 3600, RESET_SALT)
    except SignatureExpired:
        flash('Reset link expired.')
        return redirect(url_for('auth.login'))

    email = o['email']

    form = SetPasswordForm()

    if form.validate_on_submit():
        db = get_db()
        db.execute(
            "UPDATE user SET password = ? WHERE email = ?",
            (generate_password_hash(form.password.data), email))
        db.commit()
        flash('Password was updated.')
        return redirect(url_for('auth.login'))

    return render_template('auth/set_password.html', email=email, form=form)


@bp.route("/<string:sig>/register", methods=("GET", "POST"))
def register_confirm(sig):
    if g.user is not None:
        return redirect(url_for('user.profiles'))
    
    try:
        o = load_sig(current_app, sig, 3600, REGISTER_SALT)
    except SignatureExpired:
        flash('Registration link expired.')
        return redirect(url_for('auth.register'))

    email = o['email']

    db = get_db()
    row = db.execute("SELECT 1 FROM user WHERE lower(email) = lower(?)", (email,)).fetchone()
    if row is not None:
        flash(f'{email} is already registered.')
        return redirect(url_for('auth.login'))

    form = SetPasswordForm()

    if form.validate_on_submit():
        db.execute(
            "INSERT INTO user (email, password) VALUES (?, ?)",
            (email, generate_password_hash(form.password.data)))
        db.commit()
        flash(f'{email} registration completed.')
        return redirect(url_for("auth.login"))

    return render_template('auth/set_password.html', email=email, form=form)


@bp.route("/reset_password", methods=("GET", "POST"))
def reset_password():
    if g.user is not None:
        return redirect(url_for('user.profiles'))

    form = ResetPasswordForm()

    if form.validate_on_submit():
        db = get_db()
        user = db.execute(
                "SELECT * FROM user WHERE lower(email) = lower(?)", (form.email.data,)
                ).fetchone()
        email = user['email']

        sig = dump_sig(current_app, {'email': email}, RESET_SALT)
        
        reset_url = url_for('auth.reset_password_confirm', sig=sig, _external=True)

        msg = Message('Mudslinger Password Reset', 
            sender=('Mudslinger Client', 'mudslinger.client@gmail.com'),
            recipients=[email])
        msg.html = f"""
        <span><b>You have requested a password reset.</b></span>
        <br>
        <br>
        <span>Please follow the link below to set a new password.</span>
        <br>
        <span>Note: the link will expire after 60 minutes.</span>
        <br>
        <a href={reset_url}>{reset_url}</a>"""
        mail.send(msg)

        flash(
            f'An email with a password reset link has been sent to {form.email.data}. '
             'Please check your inbox.')
        form.email.data = ''

    return render_template('auth/reset_password.html', form=form)


@bp.route("/register", methods=("GET", "POST"))
def register():
    if g.user is not None:
        return redirect(url_for('user.profiles'))

    form = RegistrationForm()

    if form.validate_on_submit():
        sig = dump_sig(current_app, {'email': form.email.data}, REGISTER_SALT)
        
        reg_url = url_for('auth.register_confirm', sig=sig, _external=True)

        msg = Message('Mudslinger Registration', 
            sender=('Mudslinger Client', 'mudslinger.client@gmail.com'),
            recipients=[form.email.data])
        msg.html = f"""
        <span><b>Welcome to Mudslinger!</b></span>
        <br>
        <br>
        <span>To continue registration, please follow the link below to set your password.</span>
        <br>
        <span>Note: the link will expire after 60 minutes.</span>
        <br>
        <a href={reg_url}>{reg_url}</a>"""
        mail.send(msg)

        flash(
            f'An email with a registration link has been sent to {form.email.data}. '
             'Please check your inbox.')
        form.email.data = ''


    return render_template('auth/register.html', form=form)


@bp.route("/login", methods=("GET", "POST"))
def login():
    if g.user is not None:
        return redirect(url_for('user.profiles'))

    form = LoginForm()

    if form.validate_on_submit():
        db = get_db()
        error = None
        user = db.execute(
            "SELECT * FROM user WHERE lower(email) = lower(?)", (form.email.data,)
        ).fetchone()

        if user is None:
            error = "Incorrect email."
        elif not check_password_hash(user["password"], form.password.data):
            error = "Incorrect password."

        if error is None:
            # store the user id in a new session and return to the index
            session.clear()
            session["user_id"] = user["id"]
            return redirect(url_for("user.profiles"))

        flash(error)

    return render_template("auth/login.html", form=form)


@bp.route("/logout")
def logout():
    """Clear the current session, including the stored user id."""
    session.clear()
    return redirect(url_for("root.index"))
