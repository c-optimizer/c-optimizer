import React from 'react';

function ToggleSwitch({ checked, onChange, variant = 'primary', disabled = false }) {
  const activeColor =
    variant === 'danger'
      ? 'bg-c-danger shadow-glow-danger'
      : variant === 'secondary'
      ? 'bg-c-secondary shadow-glow-secondary'
      : 'bg-c-primary shadow-glow-primary';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out
        ${checked ? activeColor : 'bg-c-border'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}

export default ToggleSwitch;