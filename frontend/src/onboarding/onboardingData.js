/**
 * Onboarding copy — condition-specific phrases and descriptions.
 * Condition values must match backend `ConditionType` / Convex literals.
 */

export const CONDITION_ORDER = ["dysarthria", "stuttering", "aphasia", "general"];

export const ONBOARDING_BY_CONDITION = {
  dysarthria: {
    id: "dysarthria",
    label: "Dysarthria",
    shortLabel: "Dysarthria",
    description:
      "Dysarthria affects the muscles used for speech, making sounds slurred, soft, or imprecise. These phrases are loaded with consonant clusters and word-final sounds which are the patterns dysarthria most commonly distorts.",
    phrases: [
      "The black cat stretched and slept on the soft rug.",
      "She gripped the cold glass and placed it beside the lamp.",
      "He asked the bright student to print the draft quickly.",
      "Dad passed the bread and pressed his thumb on the page.",
      "The strong wind blew past the bridge and bent the sign.",
      "Both paths split at the thick oak and curved back left.",
      "My friend brought a gift wrapped in green and gold cloth.",
      "The nurse checked the pulse and scribbled notes on the chart.",
      "Five dogs jumped across the wide fence and ran down the slope.",
      "She needs time to think and must not rush the next big step.",
    ],
  },
  stuttering: {
    id: "stuttering",
    label: "Stuttering",
    shortLabel: "Stuttering",
    description:
      "Stuttering causes involuntary repetitions, prolongations, or blocks which are most often on the very first sound of a word. These phrases deliberately front-load the sounds people block on most: the stops b, p, t, d and the fricatives s and f.",
    phrases: [
      "Big brown bags were brought before breakfast.",
      "Please pick up the paper and put it in the pile.",
      "Ten tall trees toppled toward the town.",
      "Dad drove downtown to drop off the documents.",
      "Seven steps separate the store from the street sign.",
      "Five friends found a flat tire far from the farm.",
      "Both parents packed bags and boarded the plane.",
      "Take the train to downtown and drop off the ticket.",
      "Stop sending files and finish the section first.",
      "Before Tuesday, please send the form directly to my desk.",
    ],
  },
  aphasia: {
    id: "aphasia",
    label: "Aphasia",
    shortLabel: "Aphasia",
    description:
      "Aphasia affects the ability to find and produce words, particularly names for people, places, food, and parts of the body. These phrases cover all five of those everyday categories in simple, familiar sentence structures which are the kind of thing you might say at home or with a doctor.",
    phrases: [
      "My daughter made soup for dinner last night.",
      "The bread is on the kitchen table next to the fruit.",
      "My husband goes to the hospital every Tuesday morning.",
      "My left hand hurts when I lift a heavy bag.",
      "We ate eggs and toast at the table this morning.",
      "The doctor looked at my knee and said to rest for a week.",
      "My son and sister came to visit on Sunday afternoon.",
      "I need to take my medicine before I eat tonight.",
      "The garden behind our house has a big apple tree.",
      "Every morning my wife makes coffee and we sit in the living room.",
    ],
  },
  general: {
    id: "general",
    label: "General",
    shortLabel: "General",
    description:
      "These phrases cover the full range of everyday conversation — making requests, describing how you feel, giving directions, and exchanging information. There is no specific phonological target. Instead, they reflect how people actually speak: with hedges, repairs, and politeness markers included.",
    phrases: [
      "Could you please turn the volume down a little bit?",
      "I have been feeling quite tired and a bit short of breath lately.",
      "Good morning — I hope you had a nice weekend.",
      "Go straight on, then turn left at the traffic lights and it is on the right.",
      "My appointment is at half past two on Thursday afternoon.",
      "I get a bit anxious in loud or busy places, so I prefer quieter ones.",
      "Sorry, I did not quite catch that — could you say it again more slowly?",
      "I live about twenty minutes from here and I usually walk in the mornings.",
      "It was really nice talking with you — take care and have a good day.",
      "I would like a cup of tea please, and could you tell me where the bathroom is?",
    ],
  },
};
