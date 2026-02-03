/**
 * Public API for Slack Block Kit
 * Exports all types, builders, patterns, and utilities
 */

// Types
export type {
  SlackBlock,
  TextObject,
  PlainTextObject,
  MrkdwnObject,
  Option,
  OptionGroup,
  ConfirmationDialog,
  DispatchActionConfig,
  Filter,
  InteractiveElement,
  ButtonElement,
  CheckboxesElement,
  RadioButtonsElement,
  SelectElement,
  SelectStaticElement,
  SelectExternalElement,
  SelectUsersElement,
  SelectConversationsElement,
  SelectChannelsElement,
  MultiSelectElement,
  MultiSelectStaticElement,
  MultiSelectExternalElement,
  MultiSelectUsersElement,
  MultiSelectConversationsElement,
  MultiSelectChannelsElement,
  PlainTextInputElement,
  EmailInputElement,
  URLInputElement,
  NumberInputElement,
  DatePickerElement,
  DatetimePickerElement,
  TimePickerElement,
  OverflowElement,
  ImageElement,
  ContextElement,
  ActionsBlock,
  ContextBlock,
  DividerBlock,
  HeaderBlock,
  ImageBlock,
  InputBlock,
  SectionBlock,
  VideoBlock,
  RichTextBlock,
  FileBlock,
  BlockAction,
  BlockActionPayload,
  ViewSubmissionPayload,
} from "./types.js";

// Low-level builders
export {
  plainText,
  mrkdwn,
  option,
  optionGroup,
  confirmationDialog,
  dispatchActionConfig,
  filter,
  button,
  checkboxes,
  radioButtons,
  staticSelect,
  externalSelect,
  usersSelect,
  conversationsSelect,
  channelsSelect,
  multiStaticSelect,
  multiExternalSelect,
  multiUsersSelect,
  multiConversationsSelect,
  multiChannelsSelect,
  textInput,
  emailInput,
  urlInput,
  numberInput,
  datePicker,
  datetimePicker,
  timePicker,
  overflow,
  image,
  section,
  actions,
  context,
  divider,
  header,
  imageBlock,
  input,
} from "./builders.js";

// High-level patterns
export {
  multipleChoiceQuestion,
  taskProposal,
  form,
  actionItemList,
  confirmation,
  statusUpdate,
  progressUpdate,
  informationGrid,
} from "./patterns.js";

// Interactive handlers
export {
  InteractiveHandlerRegistry,
  globalHandlerRegistry,
  type BlockActionHandler,
  type BlockActionHandlerParams,
} from "./interactive.js";

// Validation
export {
  validateBlocks,
  validateMobileReadability,
  validateUniqueActionIds,
  validateAll,
  type ValidationResult,
} from "./validation.js";

// Fallback and utilities
export { blocksToPlainText, validateBlocksForLimits } from "./fallback.js";
