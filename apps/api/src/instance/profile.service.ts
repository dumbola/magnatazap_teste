
import { Injectable, Logger } from '@nestjs/common';
import * as sharp from 'sharp';

@Injectable()
export class ProfileService {
    private readonly logger = new Logger(ProfileService.name);

    /**
     * Applies "Hash Buster" technique to make an image binary unique.
     * Changes metadata and adds imperceptible noise.
     */
    async uniqueImage(base64: string): Promise<Buffer> {
        try {
            // Remove header if present
            const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');

            // Random metadata to ensure uniqueness
            const randomQual = Math.floor(Math.random() * (95 - 85 + 1) + 85); // 85-95 quality
            const randomMeta = {
                'comment': `Created at ${new Date().toISOString()} - ${Math.random()}`,
                'software': 'PixelBuster v1'
            };

            // 1. Random Crop/Resize (modify dimensions by 1px) to break Perceptual Hashes
            const metadata = await sharp(buffer).metadata();
            const width = metadata.width || 500;
            const newWidth = Math.random() > 0.5 ? width - 1 : width;

            // 2. Add invisible noise layer (modulate brightness slightly)
            const brightness = 1 + (Math.random() * 0.02 - 0.01); // +/- 1% brightness

            const pipeline = sharp(buffer)
                .resize(newWidth) // Changes Pixel Grid
                .modulate({ brightness }) // Changes Pixel Values
                .withMetadata({
                    exif: {
                        IFD0: {
                            Copyright: `Unique-${Math.random()}`
                        }
                    }
                })
                .jpeg({
                    quality: randomQual,
                    mozjpeg: true
                });

            return await pipeline.toBuffer();

        } catch (error: any) {
            this.logger.error(`Hash Buster failed: ${error.message}`);
            throw new Error('Failed to process image unique variation');
        }
    }
}
