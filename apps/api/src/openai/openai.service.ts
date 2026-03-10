
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenaiService {
    private readonly logger = new Logger(OpenaiService.name);

    async generateProfiles(count: number, context: string, apiKey: string, assistantId?: string): Promise<{ name: string; bio: string }[]> {
        try {
            const openai = new OpenAI({ apiKey });
            let content = '';

            if (assistantId) {
                this.logger.log(`Using Assistant ID: ${assistantId}`);

                // 1. Create Thread
                const thread = await openai.beta.threads.create();

                // 2. Add Message
                await openai.beta.threads.messages.create(thread.id, {
                    role: 'user',
                    content: `Contexto: "${context}". Gere ${count} perfis. Retorne APENAS um JSON array válido dentro da chave 'profiles'.`
                });

                // 3. Run Assistant
                const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
                    assistant_id: assistantId,
                });

                if (run.status !== 'completed') {
                    throw new Error(`Assistant run failed with status: ${run.status}`);
                }

                // 4. Get Messages
                const messages = await openai.beta.threads.messages.list(thread.id);
                const lastMessage = messages.data.find(m => m.role === 'assistant');

                if (lastMessage && lastMessage.content[0].type === 'text') {
                    content = lastMessage.content[0].text.value;
                } else {
                    throw new Error('Assistant did not return text.');
                }

            } else {
                this.logger.log('Using Standard GPT-3.5 Model');
                // Standard Chat Completion Fallback
                const prompt = `
        Você é uma API JSON.
        Gere um JSON array STRICT com exatamente ${count} objetos dentro da chave "profiles".
        Formato da resposta:
        {
          "profiles": [
             { "name": "...", "bio": "..." }
          ]
        }
        
        - "name": Um nome realístico (pessoa ou empresa, dependendo do contexto).
        - "bio": Uma frase curta e natural para o recado do WhatsApp (max 130 caracteres).
        
        Contexto/Tema: "${context}"
        
        Retorne APENAS um JSON válido com a chave 'profiles' (array de {name, bio}). Não use Markdown.
      `;

                const response = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo', // or gpt-4o-mini if available to user
                    messages: [{ role: 'system', content: prompt }],
                    temperature: 0.7,
                });

                content = response.choices[0].message.content || '';
            }

            if (!content) throw new Error('Empty response from AI');

            // Clean cleanup just in case
            const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();

            const parsed = JSON.parse(cleaned);

            // Check for the 'profiles' key as requested
            let profiles = [];
            if (Array.isArray(parsed)) {
                // Fallback if AI ignores new prompt and returns array
                profiles = parsed;
            } else if (parsed.profiles && Array.isArray(parsed.profiles)) {
                profiles = parsed.profiles;
            } else {
                throw new Error('AI returned invalid format (missing profiles array)');
            }

            return profiles.slice(0, count);

        } catch (error: any) {
            this.logger.error(`Failed to generate profiles: ${error.message}`);
            throw new Error(`AI Generation Failed: ${error.message}`);
        }
    }
}
