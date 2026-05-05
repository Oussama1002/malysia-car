import { z } from 'zod';

export const loginFormSchema = z.object({
  email: z.string().min(1).email(),
  password: z.string().min(4, 'Min. 4 caractères'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
