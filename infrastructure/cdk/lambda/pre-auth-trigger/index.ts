import { PreAuthenticationTriggerEvent, PreAuthenticationTriggerHandler } from 'aws-lambda';

export const handler: PreAuthenticationTriggerHandler = async (
  event: PreAuthenticationTriggerEvent
) => {
  console.log('Pre-authentication trigger invoked', JSON.stringify(event, null, 2));

  const whitelistedEmails = (process.env.WHITELISTED_EMAILS || '').split(',').map(e => e.trim());
  const userEmail = event.request.userAttributes.email;

  console.log(`Checking email: ${userEmail}`);
  console.log(`Whitelisted emails: ${whitelistedEmails.join(', ')}`);

  if (!whitelistedEmails.includes(userEmail)) {
    console.log(`Blocked login attempt for non-whitelisted email: ${userEmail}`);
    throw new Error(`Email ${userEmail} is not authorized to access this application. Please contact the administrator.`);
  }

  console.log(`Allowed login for whitelisted email: ${userEmail}`);
  return event;
};
