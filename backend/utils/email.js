module.exports = {
  sendVerificationEmail: async (toEmail, verifyUrl) => {
    // In Phase 1, we just log the link. Later, we can use any tool to send to their mail.
    console.log('==== EMAIL VERIFICATION ====');
    console.log(`To: ${toEmail}`);
    console.log(`Verify: ${verifyUrl}`);
    console.log('==================================');
    return true;
  }
};
