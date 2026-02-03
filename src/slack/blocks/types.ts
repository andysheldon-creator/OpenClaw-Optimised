/**
 * Complete TypeScript type definitions for Slack Block Kit
 * Based on Slack API documentation: https://api.slack.com/block-kit
 */

// ============================================================================
// Text Objects
// ============================================================================

export interface PlainTextObject {
  type: "plain_text";
  text: string;
  emoji?: boolean;
}

export interface MrkdwnObject {
  type: "mrkdwn";
  text: string;
  verbatim?: boolean;
}

export type TextObject = PlainTextObject | MrkdwnObject;

// ============================================================================
// Composition Objects
// ============================================================================

export interface Option {
  text: PlainTextObject;
  value: string;
  description?: PlainTextObject;
  url?: string;
}

export interface OptionGroup {
  label: PlainTextObject;
  options: Option[];
}

export interface ConfirmationDialog {
  title: PlainTextObject;
  text: TextObject;
  confirm: PlainTextObject;
  deny: PlainTextObject;
  style?: "primary" | "danger";
}

export interface DispatchActionConfig {
  trigger_actions_on?: ("on_enter_pressed" | "on_character_entered")[];
}

export interface Filter {
  include?: ("im" | "mpim" | "private" | "public")[];
  exclude_external_shared_channels?: boolean;
  exclude_bot_users?: boolean;
}

// ============================================================================
// Interactive Elements
// ============================================================================

export interface ButtonElement {
  type: "button";
  text: PlainTextObject;
  action_id: string;
  url?: string;
  value?: string;
  style?: "primary" | "danger";
  confirm?: ConfirmationDialog;
  accessibility_label?: string;
}

export interface CheckboxesElement {
  type: "checkboxes";
  action_id: string;
  options: Option[];
  initial_options?: Option[];
  confirm?: ConfirmationDialog;
  focus_on_load?: boolean;
}

export interface DatePickerElement {
  type: "datepicker";
  action_id: string;
  initial_date?: string;
  confirm?: ConfirmationDialog;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface DatetimePickerElement {
  type: "datetimepicker";
  action_id: string;
  initial_date_time?: number;
  confirm?: ConfirmationDialog;
  focus_on_load?: boolean;
}

export interface EmailInputElement {
  type: "email_text_input";
  action_id: string;
  initial_value?: string;
  dispatch_action_config?: DispatchActionConfig;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface FileInputElement {
  type: "file_input";
  action_id: string;
  filetypes?: string[];
  max_files?: number;
}

export interface MultiSelectStaticElement {
  type: "multi_static_select";
  action_id: string;
  options?: Option[];
  option_groups?: OptionGroup[];
  initial_options?: Option[];
  confirm?: ConfirmationDialog;
  max_selected_items?: number;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface MultiSelectExternalElement {
  type: "multi_external_select";
  action_id: string;
  min_query_length?: number;
  initial_options?: Option[];
  confirm?: ConfirmationDialog;
  max_selected_items?: number;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface MultiSelectUsersElement {
  type: "multi_users_select";
  action_id: string;
  initial_users?: string[];
  confirm?: ConfirmationDialog;
  max_selected_items?: number;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface MultiSelectConversationsElement {
  type: "multi_conversations_select";
  action_id: string;
  initial_conversations?: string[];
  default_to_current_conversation?: boolean;
  confirm?: ConfirmationDialog;
  max_selected_items?: number;
  filter?: Filter;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface MultiSelectChannelsElement {
  type: "multi_channels_select";
  action_id: string;
  initial_channels?: string[];
  confirm?: ConfirmationDialog;
  max_selected_items?: number;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export type MultiSelectElement =
  | MultiSelectStaticElement
  | MultiSelectExternalElement
  | MultiSelectUsersElement
  | MultiSelectConversationsElement
  | MultiSelectChannelsElement;

export interface NumberInputElement {
  type: "number_input";
  action_id: string;
  is_decimal_allowed: boolean;
  initial_value?: string;
  min_value?: string;
  max_value?: string;
  dispatch_action_config?: DispatchActionConfig;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface OverflowElement {
  type: "overflow";
  action_id: string;
  options: Option[];
  confirm?: ConfirmationDialog;
}

export interface PlainTextInputElement {
  type: "plain_text_input";
  action_id: string;
  initial_value?: string;
  multiline?: boolean;
  min_length?: number;
  max_length?: number;
  dispatch_action_config?: DispatchActionConfig;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface RadioButtonsElement {
  type: "radio_buttons";
  action_id: string;
  options: Option[];
  initial_option?: Option;
  confirm?: ConfirmationDialog;
  focus_on_load?: boolean;
}

export interface SelectStaticElement {
  type: "static_select";
  action_id: string;
  options?: Option[];
  option_groups?: OptionGroup[];
  initial_option?: Option;
  confirm?: ConfirmationDialog;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface SelectExternalElement {
  type: "external_select";
  action_id: string;
  min_query_length?: number;
  initial_option?: Option;
  confirm?: ConfirmationDialog;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface SelectUsersElement {
  type: "users_select";
  action_id: string;
  initial_user?: string;
  confirm?: ConfirmationDialog;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface SelectConversationsElement {
  type: "conversations_select";
  action_id: string;
  initial_conversation?: string;
  default_to_current_conversation?: boolean;
  confirm?: ConfirmationDialog;
  response_url_enabled?: boolean;
  filter?: Filter;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export interface SelectChannelsElement {
  type: "channels_select";
  action_id: string;
  initial_channel?: string;
  confirm?: ConfirmationDialog;
  response_url_enabled?: boolean;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export type SelectElement =
  | SelectStaticElement
  | SelectExternalElement
  | SelectUsersElement
  | SelectConversationsElement
  | SelectChannelsElement;

export interface TimePickerElement {
  type: "timepicker";
  action_id: string;
  initial_time?: string;
  confirm?: ConfirmationDialog;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
  timezone?: string;
}

export interface URLInputElement {
  type: "url_text_input";
  action_id: string;
  initial_value?: string;
  dispatch_action_config?: DispatchActionConfig;
  focus_on_load?: boolean;
  placeholder?: PlainTextObject;
}

export type InteractiveElement =
  | ButtonElement
  | CheckboxesElement
  | DatePickerElement
  | DatetimePickerElement
  | EmailInputElement
  | FileInputElement
  | MultiSelectElement
  | NumberInputElement
  | OverflowElement
  | PlainTextInputElement
  | RadioButtonsElement
  | SelectElement
  | TimePickerElement
  | URLInputElement;

// ============================================================================
// Block Elements (for use in blocks)
// ============================================================================

export interface ImageElement {
  type: "image";
  image_url: string;
  alt_text: string;
}

// Context elements can be images or text
export type ContextElement = ImageElement | TextObject;

// ============================================================================
// Layout Blocks
// ============================================================================

export interface ActionsBlock {
  type: "actions";
  elements: InteractiveElement[];
  block_id?: string;
}

export interface ContextBlock {
  type: "context";
  elements: ContextElement[];
  block_id?: string;
}

export interface DividerBlock {
  type: "divider";
  block_id?: string;
}

export interface FileBlock {
  type: "file";
  external_id: string;
  source: string;
  block_id?: string;
}

export interface HeaderBlock {
  type: "header";
  text: PlainTextObject;
  block_id?: string;
}

export interface ImageBlock {
  type: "image";
  image_url: string;
  alt_text: string;
  title?: PlainTextObject;
  block_id?: string;
}

export interface InputBlock {
  type: "input";
  label: PlainTextObject;
  element:
    | PlainTextInputElement
    | EmailInputElement
    | URLInputElement
    | NumberInputElement
    | CheckboxesElement
    | RadioButtonsElement
    | SelectElement
    | MultiSelectElement
    | DatePickerElement
    | DatetimePickerElement
    | TimePickerElement
    | FileInputElement;
  dispatch_action?: boolean;
  block_id?: string;
  hint?: PlainTextObject;
  optional?: boolean;
}

export interface SectionBlock {
  type: "section";
  text?: TextObject;
  block_id?: string;
  fields?: TextObject[];
  accessory?: InteractiveElement | ImageElement;
}

export interface VideoBlock {
  type: "video";
  alt_text: string;
  author_name?: string;
  block_id?: string;
  description?: PlainTextObject;
  provider_icon_url?: string;
  provider_name?: string;
  title: PlainTextObject;
  title_url?: string;
  thumbnail_url: string;
  video_url: string;
}

// Rich text is complex - simplified for now
export interface RichTextBlock {
  type: "rich_text";
  elements: unknown[];
  block_id?: string;
}

export type SlackBlock =
  | ActionsBlock
  | ContextBlock
  | DividerBlock
  | FileBlock
  | HeaderBlock
  | ImageBlock
  | InputBlock
  | SectionBlock
  | VideoBlock
  | RichTextBlock;

// ============================================================================
// Action Payloads (for handling interactions)
// ============================================================================

export interface BlockAction {
  type: string;
  action_id: string;
  block_id: string;
  value?: string;
  selected_option?: Option;
  selected_options?: Option[];
  selected_date?: string;
  selected_date_time?: number;
  selected_time?: string;
  selected_conversation?: string;
  selected_conversations?: string[];
  selected_channel?: string;
  selected_channels?: string[];
  selected_user?: string;
  selected_users?: string[];
  action_ts: string;
}

export interface BlockActionPayload {
  type: "block_actions";
  user: {
    id: string;
    username?: string;
    name?: string;
    team_id?: string;
  };
  api_app_id: string;
  token: string;
  container: {
    type: string;
    message_ts?: string;
    channel_id?: string;
    is_ephemeral?: boolean;
    thread_ts?: string;
  };
  trigger_id: string;
  team: {
    id: string;
    domain: string;
  };
  enterprise: null | {
    id: string;
    name: string;
  };
  is_enterprise_install: boolean;
  channel?: {
    id: string;
    name?: string;
  };
  message?: {
    type: string;
    user?: string;
    ts: string;
    bot_id?: string;
    app_id?: string;
    text?: string;
    team?: string;
    blocks?: SlackBlock[];
    thread_ts?: string;
  };
  state?: {
    values: Record<string, Record<string, unknown>>;
  };
  response_url: string;
  actions: BlockAction[];
}

export interface ViewSubmissionPayload {
  type: "view_submission";
  team: {
    id: string;
    domain: string;
  };
  user: {
    id: string;
    username?: string;
    name?: string;
    team_id?: string;
  };
  api_app_id: string;
  token: string;
  trigger_id: string;
  view: {
    id: string;
    team_id: string;
    type: string;
    blocks: SlackBlock[];
    private_metadata: string;
    callback_id: string;
    state: {
      values: Record<string, Record<string, unknown>>;
    };
    hash: string;
    title: PlainTextObject;
    clear_on_close: boolean;
    notify_on_close: boolean;
    close: PlainTextObject | null;
    submit: PlainTextObject | null;
    previous_view_id: string | null;
    root_view_id: string;
    app_id: string;
    external_id: string;
    app_installed_team_id: string;
    bot_id: string;
  };
  response_urls: Array<{
    block_id: string;
    action_id: string;
    channel_id: string;
    response_url: string;
  }>;
  is_enterprise_install: boolean;
}
