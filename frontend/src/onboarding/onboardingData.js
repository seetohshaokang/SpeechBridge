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
    voiceScript:
      "The crisp morning air brushed against the garden fence as the first light stretched across the grass. A bright red bird perched on the branch of the old oak tree, whistling a short, sharp tune. My grandmother always said that fresh bread and strong tea were the best start to any day. She would press the dough flat, sprinkle the crust with salt, and slide it into the oven with both hands. The smell drifted through every room. My grandfather would sit at the kitchen table, flipping through the thick newspaper, glasses balanced on the bridge of his nose. He once told me the strongest bridges are built plank by plank, not all at once. I still think about that when big tasks feel impossible. Last Thursday, a friend and I walked past the old library, turned left at the post office, and stopped at a small shop that sells hand-printed cards. The clerk behind the desk smiled and asked if we needed help. We picked out three cards, wrapped them in brown paper, and dropped them in the post before lunch. The wind picked up on the walk back, but it felt good against my face.",
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
    voiceScript:
      "Before breakfast this morning, I sat down at the big table by the window and poured a cup of tea. The steam drifted slowly toward the ceiling while I planned the day ahead. First, I needed to take the dog to the park. Then I had to pick up some groceries, specifically bread, butter, pasta, and a few fresh tomatoes. The store on the corner tends to close early on Saturdays, so I like to get there before ten. After that, I decided to call my friend David to see if he wanted to have lunch downtown. David suggested a small place near the fountain that serves excellent soup and sandwiches. We sat outside for about an hour, talking about podcasts, weekend plans, and a documentary about deep-sea diving. Driving home, I stopped at the post office to send a parcel to my sister. The person behind the counter asked me to fill out a form, sign at the bottom, and place it in the tray. I thanked them, stepped back outside, and felt the cool afternoon breeze. Sometimes the simplest days feel the best, just running errands, seeing a friend, and taking your time.",
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
    voiceScript:
      "My name is Sarah and I live in a small house near the park. Every morning I wake up, wash my face, and go to the kitchen. I make coffee and eat toast with butter. My husband John sits at the table and reads the news. Our daughter Emma visits on Sunday. She brings fruit and flowers from the shop. Last week she brought apples, bananas, and a big bunch of yellow roses. My doctor says I should walk every day, so after breakfast I go to the park. I walk slowly around the pond and sit on the bench near the big tree. Sometimes I see my neighbour Tom. He has a small brown dog named Charlie. Tom always says hello and asks how I am feeling. I tell him my arm is better but my knee still hurts a little. In the afternoon I like to sit in the living room and watch television. I usually cook dinner around five. Tonight I am making rice and chicken with vegetables. John will set the table and pour the water. After dinner we sit together and talk about the day.",
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
    voiceScript:
      "Good morning. I hope you are doing well today. I wanted to tell you a little bit about my week. On Monday I had a doctor's appointment in the city centre. I took the bus, which was about twenty minutes, and arrived a bit early. The waiting room was quite busy, so I sat near the window and read a magazine. The doctor was friendly and said everything looked fine. On the way home I stopped at a cafe and ordered a cup of tea and a small sandwich. The woman behind the counter asked if I wanted milk and sugar. I said just milk, please. Tuesday was quieter. I spent most of the day at home, doing some cleaning and catching up on phone calls. My friend Laura rang in the afternoon and we talked for about half an hour. She told me about a new restaurant near her office that she really likes. On Wednesday I went for a long walk in the park. The weather was lovely, sunny with a light breeze. I walked along the river, past the old bridge, and back through the high street. I bought some fruit and vegetables from the market and headed home to cook dinner.",
  },
};
