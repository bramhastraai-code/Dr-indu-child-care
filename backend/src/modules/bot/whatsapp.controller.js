const MessageLog = require('../../models/MessageLog');
const { normalizeWaId } = require('../../utils/helpers');

// @desc    Centralized WhatsApp messenger sending
// @route   POST /api/whatsapp/send
// @access  Public (Internal/n8n)
exports.sendWhatsApp = async (req, res) => {
    try {
        const { to, template_name, template_params, wa_id, template, variables } = req.body || {};

        // Support both naming conventions for flexibility
        const target = normalizeWaId(to || wa_id);
        const final_template = template_name || template;
        const final_params = template_params || variables;

        if (!target || !final_template) {
            return res.status(400).json({ success: false, message: 'Recipient (to/wa_id) and template_name are required' });
        }

        console.log(`[WhatsApp Outbound] To: ${target}, Template: ${final_template}`);

        // In a real implementation: make axios call to WATI here
        // const watiResponse = await axios.post(WATI_URL, { target, final_template, final_params });

        // Log the outbound message to DB
        const log = await MessageLog.create({
            wa_id: target,
            template_name: final_template,
            template_params: final_params || {},
            status: 'SENT', // Simulate immediate success for now
            sent_at: new Date()
        });

        res.status(200).json({
            success: true,
            message: 'WhatsApp message request queued',
            data: {
                log_id: log._id,
                to: target,
                template: final_template
            }
        });
    } catch (err) {
        console.error('[WhatsApp Send Error]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
