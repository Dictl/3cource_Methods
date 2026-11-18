from django import forms
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.utils.translation import gettext_lazy as _


class RussianAuthenticationForm(AuthenticationForm):
    error_messages = {
        'invalid_login': _('Неверный логин или пароль.'),
        'inactive': _('Этот аккаунт отключён.'),
    }


class RussianUserCreationForm(UserCreationForm):
    password1 = forms.CharField(
        label=_('Пароль'),
        strip=False,
        widget=forms.PasswordInput(attrs={'autocomplete': 'new-password'}),
        help_text=_('Не короче 8 символов, не только цифры и не похож на логин.'),
    )
    password2 = forms.CharField(
        label=_('Повтор пароля'),
        strip=False,
        widget=forms.PasswordInput(attrs={'autocomplete': 'new-password'}),
        help_text=_('Введите тот же пароль ещё раз.'),
    )
