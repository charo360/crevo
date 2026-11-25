import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        canonicalEmail: {
            type: String,
            lowercase: true,
            trim: true,
            index: true,
        },
        signupIp: {
            type: String,
            index: true,
        },
        passwordHash: {
            type: String,
            required: true,
        },
        resetPasswordTokenHash: {
            type: String,
            index: true,
            default: null,
        },
        resetPasswordExpiresAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

const userCreditsSchema = new mongoose.Schema(
    {
        user_id: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        balance: { type: Number, default: 0 },
        total_earned: { type: Number, default: 0 },
        total_spent: { type: Number, default: 0 },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

const creditTransactionSchema = new mongoose.Schema(
    {
        user_id: { type: String, required: true, index: true },
        amount: { type: Number, required: true },
        transaction_type: {
            type: String,
            enum: ['usage', 'purchase', 'bonus', 'refund'],
            required: true,
        },
        description: { type: String, default: '' },
        reference_id: { type: String, default: null },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
    }
);

const creditUsageSchema = new mongoose.Schema(
    {
        user_id: { type: String, required: true, index: true },
        transaction_id: { type: String, default: null },
        feature_type: { type: String, required: true },
        feature_id: { type: String, default: null },
        credits_used: { type: Number, required: true },
        platform: { type: String, default: null },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
    }
);

const creditPackSchema = new mongoose.Schema(
    {
        stripe_price_id: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true },
        credits: { type: Number, required: true },
        price_cents: { type: Number, required: true },
        active: { type: Boolean, default: true },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

const paymentSchema = new mongoose.Schema(
    {
        user_id: { type: String, required: true, index: true },
        stripe_session_id: { type: String, index: true },
        amount_cents: { type: Number, default: 0 },
        credits: { type: Number, default: 0 },
        status: { type: String, default: 'completed' },
        credit_packs: {
            name: String,
            credits: Number,
            price_cents: Number,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
    }
);

const repurposedVideoSchema = new mongoose.Schema(
    {
        id: { type: String, required: true, unique: true, index: true },
        user_id: { type: String, required: true, index: true },
        original_video_id: { type: String },
        original_video_url: { type: String },
        original_video_title: { type: String },
        original_video_duration: { type: Number },
        status: { type: String, default: 'pending' },
        ml_analysis_id: { type: String },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        created_at: { type: String },
        updated_at: { type: String },
    },
    { versionKey: false }
);

const viralClipSchema = new mongoose.Schema(
    {
        id: { type: String, required: true, unique: true, index: true },
        repurposed_video_id: { type: String, required: true, index: true },
        clip_url: { type: String },
        clip_storage_path: { type: String },
        start_time: { type: Number },
        end_time: { type: Number },
        duration: { type: Number },
        virality_score: { type: Number, default: 0 },
        engagement_score: { type: Number, default: 0 },
        title: { type: String },
        description: { type: String },
        thumbnail_url: { type: String },
        transcript_snippet: { type: String },
        platform_format: { type: String },
        aspect_ratio: { type: String },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        created_at: { type: String },
    },
    { versionKey: false }
);

const mlAnalysisSchema = new mongoose.Schema(
    {
        id: { type: String, required: true, unique: true, index: true },
        repurposed_video_id: { type: String, required: true, index: true },
        analysis_version: { type: String },
        scene_segments: { type: mongoose.Schema.Types.Mixed },
        audio_analysis: { type: mongoose.Schema.Types.Mixed },
        transcript_analysis: { type: mongoose.Schema.Types.Mixed },
        visual_features: { type: mongoose.Schema.Types.Mixed },
        engagement_predictions: { type: mongoose.Schema.Types.Mixed },
        viral_moments: { type: mongoose.Schema.Types.Mixed },
        processing_time_ms: { type: Number },
        created_at: { type: String },
    },
    { versionKey: false }
);

const repurposeJobSchema = new mongoose.Schema(
    {
        id: { type: String, required: true, unique: true, index: true },
        user_id: { type: String, required: true, index: true },
        video_url: { type: String },
        status: { type: String, default: 'pending' },
        progress: { type: Number, default: 0 },
        error_message: { type: String },
        repurposed_video_id: { type: String },
        created_at: { type: String },
        updated_at: { type: String },
    },
    { versionKey: false }
);

const newsletterSubscriberSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
    }
);

const freeTrialUsageSchema = new mongoose.Schema(
    {
        tool: { type: String, required: true, index: true },
        ip: { type: String, required: true, index: true },
        fingerprint: { type: String, default: '', index: true },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
    }
);
freeTrialUsageSchema.index({ tool: 1, ip: 1 });
freeTrialUsageSchema.index({ tool: 1, fingerprint: 1 });

const userWorkSchema = new mongoose.Schema(
    {
        user_id: { type: String, required: true, index: true },
        type: { type: String, enum: ['thumbnail', 'resize', 'clip'], default: 'thumbnail', index: true },
        title: { type: String, default: 'Untitled Design' },
        platform: { type: String, default: '' },
        aspect_ratio: { type: String, default: '' },
        mime_type: { type: String, default: 'image/png' },
        file_name: { type: String, required: true },
        file_size: { type: Number, default: 0 },
        expires_at: { type: Date, required: true, index: true },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
    }
);
userWorkSchema.index({ user_id: 1, created_at: -1 });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const UserCredits = mongoose.models.UserCredits || mongoose.model('UserCredits', userCreditsSchema);
export const CreditTransaction =
    mongoose.models.CreditTransaction || mongoose.model('CreditTransaction', creditTransactionSchema);
export const CreditUsage = mongoose.models.CreditUsage || mongoose.model('CreditUsage', creditUsageSchema);
export const CreditPack = mongoose.models.CreditPack || mongoose.model('CreditPack', creditPackSchema);
export const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
export const RepurposedVideo =
    mongoose.models.RepurposedVideo || mongoose.model('RepurposedVideo', repurposedVideoSchema);
export const ViralClip = mongoose.models.ViralClip || mongoose.model('ViralClip', viralClipSchema);
export const MLAnalysis = mongoose.models.MLAnalysis || mongoose.model('MLAnalysis', mlAnalysisSchema);
export const RepurposeJob = mongoose.models.RepurposeJob || mongoose.model('RepurposeJob', repurposeJobSchema);
export const NewsletterSubscriber =
    mongoose.models.NewsletterSubscriber || mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);
export const FreeTrialUsage =
    mongoose.models.FreeTrialUsage || mongoose.model('FreeTrialUsage', freeTrialUsageSchema);
export const UserWork =
    mongoose.models.UserWork || mongoose.model('UserWork', userWorkSchema);
