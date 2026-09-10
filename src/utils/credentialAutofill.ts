/** Best-effort opt-out for native autofill and password-manager extensions.
 * Browsers/extensions may ignore these hints: a website cannot enforce a
 * "never save passwords" policy. Keep real password inputs and keyboard submit.
 */
export const credentialAutofillOptOut = {
  autoComplete: 'off',
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
} as const;

export const passwordInputOptOut = {
  ...credentialAutofillOptOut,
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
} as const;
