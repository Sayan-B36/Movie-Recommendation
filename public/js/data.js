export const languageOptions = [
  { value: "", label: "None", short: "—" },
  { value: "hi", label: "Hindi", short: "HI" },
  { value: "en", label: "English", short: "EN" },
  { value: "bn", label: "Bengali", short: "BN" },
  { value: "ta", label: "Tamil", short: "TA" },
  { value: "te", label: "Telugu", short: "TE" },
  { value: "ml", label: "Malayalam", short: "ML" },
  { value: "ko", label: "Korean", short: "KO" },
  { value: "ja", label: "Japanese", short: "JA" },
  { value: "es", label: "Spanish", short: "ES" },
  { value: "fr", label: "French", short: "FR" }
];

export const regionOptions = [
  { value: "", label: "Any region" },
  { value: "IN", label: "India" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "KR", label: "South Korea" },
  { value: "JP", label: "Japan" }
];

export const platformOptions = [
  { value: "", label: "Any platform" },
  { value: "8", label: "Netflix" },
  { value: "119", label: "Prime Video" },
  { value: "122", label: "Disney+ Hotstar" },
  { value: "220", label: "JioCinema" },
  { value: "232", label: "ZEE5" },
  { value: "237", label: "SonyLIV" },
  { value: "350", label: "Apple TV+" },
  { value: "11", label: "MUBI" },
  { value: "192", label: "YouTube" }
];

export const industryOptions = [
  { value: "", label: "All industries", language: "" },
  { value: "hollywood", label: "Hollywood", language: "en" },
  { value: "bollywood", label: "Bollywood", language: "hi" },
  { value: "korean", label: "Korean", language: "ko" },
  { value: "anime", label: "Anime", language: "ja", movieGenres: [16], tvGenres: [16] },
  { value: "tamil", label: "Tamil", language: "ta" },
  { value: "telugu", label: "Telugu", language: "te" },
  { value: "bengali", label: "Bengali", language: "bn" },
  { value: "malayalam", label: "Malayalam", language: "ml" }
];

export const contentTypeOptions = [
  { value: "all", label: "Movies + Series" },
  { value: "movie", label: "Movies only" },
  { value: "tv", label: "Series only" }
];

export const preferenceGroups = {
  mood: {
    label: "Mood",
    options: [
      { value: "happy", label: "Happy", icon: "Smile", movieGenres: [35, 10751, 16], tvGenres: [35, 10751, 16], minRating: 6.4, tone: "bright" },
      { value: "sad", label: "Sad", icon: "Frown", movieGenres: [18, 10749, 10402], tvGenres: [18, 10766], minRating: 6.8, tone: "emotional" },
      { value: "romantic", label: "Romantic", icon: "Heart", movieGenres: [10749, 35, 18], tvGenres: [10749, 18, 35], minRating: 6.5, tone: "warm" },
      { value: "chill", label: "Chill", icon: "Coffee", movieGenres: [35, 16, 10751, 99], tvGenres: [35, 16, 10751, 99], maxRuntime: 125, tone: "easy" },
      { value: "inspired", label: "Inspired", icon: "Sparkles", movieGenres: [18, 36, 99], tvGenres: [18, 99], minRating: 7, tone: "uplifting" },
      { value: "scared", label: "Scared", icon: "Skull", movieGenres: [27, 53, 9648], tvGenres: [9648, 10765, 18], minRating: 6, tone: "tense" },
      { value: "bored", label: "Bored", icon: "Zap", movieGenres: [28, 12, 878], tvGenres: [10759, 10765, 9648], minRating: 6.2, tone: "kinetic" },
      { value: "excited", label: "Excited", icon: "Flame", movieGenres: [28, 12, 878, 14], tvGenres: [10759, 10765], minRating: 6.4, tone: "big" }
    ]
  },
  climate: {
    label: "Climate",
    options: [
      { value: "rainy", label: "Rainy", icon: "CloudRain", movieGenres: [18, 9648, 10749], tvGenres: [18, 9648], tone: "moody" },
      { value: "sunny", label: "Sunny", icon: "Sun", movieGenres: [12, 35, 10751], tvGenres: [35, 10751], tone: "bright" },
      { value: "cold", label: "Cold", icon: "Snowflake", movieGenres: [14, 878, 18], tvGenres: [10765, 18], tone: "immersive" },
      { value: "cloudy", label: "Cloudy", icon: "Cloud", movieGenres: [18, 80, 53], tvGenres: [18, 80, 9648], tone: "slow" },
      { value: "stormy", label: "Stormy", icon: "CloudLightning", movieGenres: [53, 27, 9648], tvGenres: [9648, 10765, 80], tone: "electric" },
      { value: "night", label: "Night", icon: "Moon", movieGenres: [27, 53, 80], tvGenres: [9648, 80, 10765], tone: "dark" }
    ]
  },
  time: {
    label: "Time",
    options: [
      { value: "auto", label: "Auto", icon: "Clock3", movieGenres: [], tvGenres: [] },
      { value: "morning", label: "Morning", icon: "CloudSun", movieGenres: [35, 10751, 99], tvGenres: [35, 10751, 99], maxRuntime: 120 },
      { value: "afternoon", label: "Afternoon", icon: "Sun", movieGenres: [12, 16, 35], tvGenres: [16, 35, 10759] },
      { value: "evening", label: "Evening", icon: "Clapperboard", movieGenres: [18, 28, 10749], tvGenres: [18, 10759, 10749] },
      { value: "late-night", label: "Late night", icon: "Moon", movieGenres: [53, 27, 878, 9648], tvGenres: [9648, 10765, 80] }
    ]
  },
  occasion: {
    label: "Occasion",
    options: [
      { value: "solo", label: "Solo", icon: "UserRound", movieGenres: [18, 9648, 99], tvGenres: [18, 9648, 99], minRating: 6.8 },
      { value: "date", label: "Date night", icon: "Heart", movieGenres: [10749, 35, 18], tvGenres: [10749, 18, 35], maxRuntime: 140 },
      { value: "family", label: "Family", icon: "Users", movieGenres: [10751, 16, 35, 12], tvGenres: [10751, 16, 35], maxRuntime: 130 },
      { value: "friends", label: "Friends", icon: "PartyPopper", movieGenres: [35, 28, 12, 878], tvGenres: [35, 10759, 10765] },
      { value: "kids", label: "Kids", icon: "Baby", movieGenres: [16, 10751, 14], tvGenres: [16, 10751, 10762], maxRuntime: 115 },
      { value: "weekend", label: "Weekend", icon: "CalendarDays", movieGenres: [28, 12, 35, 14], tvGenres: [10759, 10765, 35], minRating: 6.5 }
    ]
  },
  genre: {
    label: "Genre",
    options: [
      { value: "any", label: "Any", icon: "LayoutGrid", movieGenres: [], tvGenres: [] },
      { value: "action", label: "Action", icon: "Swords", movieGenres: [28], tvGenres: [10759] },
      { value: "adventure", label: "Adventure", icon: "Mountain", movieGenres: [12], tvGenres: [10759] },
      { value: "comedy", label: "Comedy", icon: "Laugh", movieGenres: [35], tvGenres: [35] },
      { value: "drama", label: "Drama", icon: "Drama", movieGenres: [18], tvGenres: [18] },
      { value: "romance", label: "Romance", icon: "Heart", movieGenres: [10749], tvGenres: [10749] },
      { value: "thriller", label: "Thriller", icon: "Drama", movieGenres: [53], tvGenres: [9648] },
      { value: "horror", label: "Horror", icon: "Skull", movieGenres: [27], tvGenres: [9648] },
      { value: "sci-fi", label: "Sci-Fi", icon: "Atom", movieGenres: [878], tvGenres: [10765] },
      { value: "fantasy", label: "Fantasy", icon: "Wand2", movieGenres: [14], tvGenres: [10765] },
      { value: "animation", label: "Animation", icon: "Sparkles", movieGenres: [16], tvGenres: [16] },
      { value: "documentary", label: "Documentary", icon: "FileText", movieGenres: [99], tvGenres: [99] },
      { value: "mystery", label: "Mystery", icon: "Search", movieGenres: [9648], tvGenres: [9648] },
      { value: "crime", label: "Crime", icon: "Fingerprint", movieGenres: [80], tvGenres: [80] },
      { value: "war", label: "War", icon: "Shield", movieGenres: [10752], tvGenres: [10768] },
      { value: "western", label: "Western", icon: "Compass", movieGenres: [37], tvGenres: [37] },
      { value: "musical", label: "Musical", icon: "Music", movieGenres: [10402], tvGenres: [10402] },
      { value: "biopic", label: "Biopic", icon: "BookOpen", movieGenres: [36, 18], tvGenres: [99, 18] },
      { value: "superhero", label: "Superhero", icon: "Shield", movieGenres: [28, 12, 14, 878], tvGenres: [10759, 10765] },
      { value: "satire", label: "Satire", icon: "Theater", movieGenres: [35, 18], tvGenres: [35, 18] },
      { value: "sports", label: "Sports", icon: "Trophy", movieGenres: [99, 18], tvGenres: [10764] },
      { value: "noir", label: "Noir", icon: "Moon", movieGenres: [80, 53, 18], tvGenres: [80, 9648] }
    ]
  }
};

export const genreNames = {
  12: "Adventure", 14: "Fantasy", 16: "Animation", 18: "Drama", 27: "Horror",
  28: "Action", 35: "Comedy", 36: "History", 37: "Western", 53: "Thriller",
  80: "Crime", 99: "Documentary", 878: "Sci-Fi", 9648: "Mystery", 10402: "Music",
  10749: "Romance", 10751: "Family", 10752: "War", 10759: "Action", 10762: "Kids",
  10765: "Sci-Fi", 10766: "Soap"
};

export const defaultFilters = {
  mood: "romantic",
  climate: "rainy",
  time: "auto",
  occasion: "date",
  genre: "any",
  type: "all",
  industry: "",
  dubLanguage: "hi",
  dubbedOnly: false,
  platform: "",
  minRating: 6.5,
  region: "IN"
};

export const RESULT_LIMITS = {
  preEnrichment: 28,
  final: 18,
  skeleton: 8
};
