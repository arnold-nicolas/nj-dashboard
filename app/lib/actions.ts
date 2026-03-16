'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const sql = postgres(process.env.POSTGRESS_URL!, { ssl: 'require' });

const FormSchema = z.object({
    id: z.string(),
    customerId: z.string({
        invalid_type_error: 'Please select a customer',
    }),
    amount: z.coerce
        .number()
        .gt(0, { message: 'Please enter an amount greater than $0.'}),
    status: z.enum(['pending', 'paid'], {
        invalid_type_error: 'Please select an invoice status.',
    }),
    date: z.string(),
});

// Use Zod to update the expected types
const CreateInvoice = FormSchema.omit({id: true, date:true});
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
    errors?: {
        customerId?: string[];
        amount?: string[];
        status?: string[];
    };
    message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
    const validateFields = CreateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    // If form validation fails, return errors early. Otherwise, continue.
    if (!validateFields.success) {
        return {
            errors: validateFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Create Invoice.',
        }
    }

    // Prepare data for insertion into the database
    const { customerId, amount, status } = validateFields.data;
    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];
    try {
        await sql`
            insert into invoices(customer_id, amount, status, date)
            values (${customerId}, ${amountInCents}, ${status}, ${date})
        `;
    } catch(error) {
        console.error(error);
        return { message: 'Database Error: Failed to Create Invoice.' };
    }

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

export async function updateInvoice(id: string, prevState: State, formData: FormData) {
    const validateFields = UpdateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    // If form validation fails, return errors early. Otherwise, continue.
    if (!validateFields.success) {
        return {
            errors: validateFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Update Invoice.',
        }
    }

    // Prepare data for insertion into the database
    const { customerId, amount, status } = validateFields.data;
    const amountInCents = amount * 100;

    try {
        await sql`
            update invoices
            set customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
            where id = ${id}
        `;
    } catch (error) {
        console.log(error);
        return { message:"Database Failed. Failed to Update Invoice."};
    }

    revalidatePath('/daashboard/invoices');
    redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
    await sql`delete from invoices where id = ${id}`;

    revalidatePath('/dashboard/invoices');
}

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid Credentials.';
                default:
                    return 'Something went wrong.';
            }
        }
        throw error;
    }
}