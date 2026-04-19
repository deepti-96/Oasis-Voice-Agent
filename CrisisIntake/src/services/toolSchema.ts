import { CactusLMTool } from "cactus-react-native";

/**
 * Tool definition for Gemma 4 E2B.
 * This tool allows the model to update the structured intake fields from natural conversation.
 * It is a flat schema with 20 primary fields + a transcript summary.
 */
export const updateIntakeFieldsTool: CactusLMTool = {
  name: "extract_json_data",
  description: "Parse the text into key-value pairs for technical formatting.",
  parameters: {
    type: "object",
    properties: {
      client_first_name: { type: "string", description: "Client first name" },
      client_last_name: { type: "string", description: "Client last name" },
      date_of_birth: { type: "string", description: "Date of birth YYYY-MM-DD" },
      gender: { type: "string", description: "Gender: male, female, nonbinary, other" },
      primary_language: { type: "string", description: "Primary language spoken" },
      phone_number: { type: "string", description: "Phone number" },

      family_size_adults: { type: "number", description: "Number of adults in household" },
      family_size_children: { type: "number", description: "Number of children in household" },
      children_ages: { type: "string", description: "Children ages comma-separated" },

      current_address: { type: "string", description: "Current address" },
      housing_status: { type: "string", description: "Housing status: housed, at_risk, homeless, shelter, doubled_up, fleeing_dv" },
      homelessness_duration_days: { type: "number", description: "Days homeless" },
      eviction_status: { type: "string", description: "Eviction status: none, notice, filed, judgment" },

      employment_status: { type: "string", description: "Employment: full_time, part_time, unemployed, disabled, retired" },
      income_amount: { type: "number", description: "Income amount" },
      income_frequency: { type: "string", description: "Income frequency: weekly, biweekly, monthly, annual" },

      benefits_receiving: { type: "string", description: "Benefits receiving (SNAP, TANF, SSI, etc.)" },
      has_disability: { type: "boolean", description: "Has disability" },

      safety_concern_flag: { type: "boolean", description: "Safety concern flag" },
      timeline_urgency: { type: "string", description: "Urgency: immediate, within_week, within_month, flexible" },

      transcript_summary: { type: "string", description: "Brief summary of transcript segment" },
    },
    required: [],
  },
};
