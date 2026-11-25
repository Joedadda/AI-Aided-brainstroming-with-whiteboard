import { Field } from '@base-ui/react/field';
import { forwardRef, type TextareaHTMLAttributes } from 'react';

/**
 * A textarea wired into Base UI's Field, so the Field.Label labels it.
 * Textarea props go on the rendered element; Field adds id and aria wiring.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea(props, ref) {
    return <Field.Control render={<textarea ref={ref} {...props} />} />;
  },
);
