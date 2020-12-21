from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
from wtforms.validators import ValidationError, DataRequired, Email, EqualTo

from api_app.db import get_db


class LoginForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    submit = SubmitField('Log In')


class ResetPasswordForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    submit = SubmitField('Send')

    def validate_email(self, email):
        db = get_db()
        row = db.execute("SELECT 1 FROM user WHERE lower(email) = lower(?)", (email.data,)).fetchone()

        if row is None:
            raise ValidationError('Email address is not registered.')


class RegistrationForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    submit = SubmitField('Register')

    def validate_email(self, email):
        db = get_db()
        row = db.execute("SELECT 1 FROM user WHERE lower(email) = lower(?)", (email.data,)).fetchone()

        if row is not None:
            raise ValidationError('Email address already registered.')


class SetPasswordForm(FlaskForm):
    password = PasswordField('Password', validators=[DataRequired()])
    password2 = PasswordField(
        'Repeat Password', validators=[DataRequired(), EqualTo('password')])
    submit = SubmitField('Register')
