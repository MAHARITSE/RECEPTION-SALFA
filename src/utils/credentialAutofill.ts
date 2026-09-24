/** Best-effort opt-out for native autofill, browser password saving prompts, and password-manager extensions.
 * Configured to prevent Google Chrome Password Manager, Google Smart Lock, Safari, Firefox, Edge,
 * and extensions (Bitwarden, 1Password, LastPass, Dashlane, etc.) from suggesting or generating passwords.
 */
export const credentialAutofillOptOut = {
  autoComplete: 'off',
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
  'data-bitwarden-watching': 'false',
  'data-dashlane-ignore': 'true',
  'data-protonpass-ignore': 'true',
  'data-google-save-password': 'false',
  'data-chrome-autofill': 'off',
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
} as const;

export const passwordInputOptOut = {
  autoComplete: 'off',
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
  'data-bitwarden-watching': 'false',
  'data-dashlane-ignore': 'true',
  'data-protonpass-ignore': 'true',
  'data-google-save-password': 'false',
  'data-chrome-autofill': 'off',
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
} as const;


