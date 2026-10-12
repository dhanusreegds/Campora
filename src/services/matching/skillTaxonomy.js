// A small, hand-written skill vocabulary used by the rule-based matcher.
//  - key:     canonical identifier
//  - label:   display name used when a skill is detected from free text
//  - aliases: other ways people write the same skill
//  - parent:  broader skill this one belongs to (gives partial credit when matching)
//
// It is intentionally simple and easy to extend: add a line and the matcher understands it.

const SKILLS = [
  // Programming languages
  { key: 'java', label: 'Java', aliases: ['java', 'core java', 'java programming', 'advanced java'] },
  { key: 'python', label: 'Python', aliases: ['python', 'python programming', 'python3'] },
  { key: 'c', label: 'C', aliases: ['c', 'c programming', 'c language', 'ansi c'] },
  { key: 'cpp', label: 'C++', aliases: ['c++', 'cpp', 'c plus plus'] },
  { key: 'csharp', label: 'C#', aliases: ['c#', 'csharp', 'c sharp'] },
  { key: 'javascript', label: 'JavaScript', aliases: ['javascript', 'js', 'es6', 'ecmascript'] },
  { key: 'typescript', label: 'TypeScript', aliases: ['typescript', 'ts'], parent: 'javascript' },
  { key: 'matlab', label: 'MATLAB', aliases: ['matlab', 'simulink'] },

  // Object-oriented programming
  {
    key: 'oop',
    label: 'OOP',
    aliases: ['oop', 'oops', 'object oriented programming', 'object oriented', 'object oriented concepts', 'object oriented design'],
  },
  { key: 'inheritance', label: 'Inheritance', aliases: ['inheritance'], parent: 'oop' },
  { key: 'polymorphism', label: 'Polymorphism', aliases: ['polymorphism', 'method overloading', 'method overriding'], parent: 'oop' },
  { key: 'encapsulation', label: 'Encapsulation', aliases: ['encapsulation', 'abstraction', 'abstract classes'], parent: 'oop' },
  { key: 'exception-handling', label: 'Exception handling', aliases: ['exception handling', 'exceptions', 'try catch'] },

  // Core computer science
  { key: 'dsa', label: 'Data Structures & Algorithms', aliases: ['dsa', 'data structures and algorithms', 'data structures & algorithms'] },
  { key: 'data-structures', label: 'Data Structures', aliases: ['data structures', 'data structure'], parent: 'dsa' },
  { key: 'algorithms', label: 'Algorithms', aliases: ['algorithms', 'algorithm', 'algorithm design', 'competitive programming'], parent: 'dsa' },
  { key: 'trees', label: 'Trees', aliases: ['trees', 'binary tree', 'binary trees', 'bst', 'binary search tree'], parent: 'data-structures' },
  { key: 'graphs', label: 'Graphs', aliases: ['graphs', 'graph algorithms'], parent: 'data-structures' },
  { key: 'linked-lists', label: 'Linked lists', aliases: ['linked list', 'linked lists'], parent: 'data-structures' },
  { key: 'recursion', label: 'Recursion', aliases: ['recursion', 'backtracking'], parent: 'algorithms' },
  { key: 'dynamic-programming', label: 'Dynamic programming', aliases: ['dynamic programming', 'dp'], parent: 'algorithms' },
  { key: 'sorting', label: 'Sorting & searching', aliases: ['sorting', 'searching', 'sorting algorithms'], parent: 'algorithms' },

  { key: 'os', label: 'Operating Systems', aliases: ['operating systems', 'operating system', 'os'] },
  { key: 'scheduling', label: 'Scheduling', aliases: ['scheduling', 'cpu scheduling', 'scheduling algorithms', 'round robin'], parent: 'os' },
  { key: 'deadlock', label: 'Deadlocks', aliases: ['deadlock', 'deadlocks'], parent: 'os' },
  { key: 'memory-management', label: 'Memory management', aliases: ['memory management', 'paging', 'virtual memory'], parent: 'os' },
  { key: 'concurrency', label: 'Concurrency', aliases: ['concurrency', 'multithreading', 'threads', 'synchronization'], parent: 'os' },

  { key: 'networks', label: 'Computer Networks', aliases: ['computer networks', 'networking', 'networks', 'tcp/ip', 'tcp ip', 'osi model'] },
  { key: 'computer-architecture', label: 'Computer Architecture', aliases: ['computer architecture', 'coa', 'computer organization'] },
  { key: 'toc', label: 'Theory of Computation', aliases: ['theory of computation', 'toc', 'automata'] },
  { key: 'compiler-design', label: 'Compiler Design', aliases: ['compiler design', 'compilers', 'compiler'] },
  { key: 'software-engineering', label: 'Software Engineering', aliases: ['software engineering', 'sdlc', 'agile', 'uml'] },
  { key: 'design-patterns', label: 'Design patterns', aliases: ['design patterns', 'design pattern'], parent: 'software-engineering' },
  { key: 'git', label: 'Git', aliases: ['git', 'github', 'version control'] },

  // Databases
  { key: 'dbms', label: 'DBMS', aliases: ['dbms', 'database', 'databases', 'database management', 'database management systems', 'rdbms', 'normalization', 'er diagram', 'er diagrams'] },
  { key: 'sql', label: 'SQL', aliases: ['sql', 'mysql', 'postgresql', 'postgres', 'sqlite', 'structured query language'], parent: 'dbms' },
  { key: 'mongodb', label: 'MongoDB', aliases: ['mongodb', 'mongo', 'nosql'], parent: 'dbms' },

  // Web and apps
  { key: 'web-development', label: 'Web Development', aliases: ['web development', 'web dev', 'web design', 'full stack', 'fullstack', 'frontend', 'front end', 'backend', 'back end'] },
  { key: 'html-css', label: 'HTML & CSS', aliases: ['html', 'css', 'html css', 'html5', 'css3', 'html/css'], parent: 'web-development' },
  { key: 'react', label: 'React', aliases: ['react', 'reactjs', 'react.js', 'redux'], parent: 'web-development' },
  { key: 'nodejs', label: 'Node.js', aliases: ['node.js', 'nodejs', 'node', 'express', 'express.js', 'expressjs'], parent: 'web-development' },
  { key: 'rest-api', label: 'REST APIs', aliases: ['rest api', 'rest apis', 'restful api', 'restful apis', 'rest', 'api', 'apis'], parent: 'web-development' },
  { key: 'android', label: 'Android', aliases: ['android', 'android development', 'kotlin', 'flutter', 'mobile app development'] },
  { key: 'cloud', label: 'Cloud & DevOps', aliases: ['cloud computing', 'cloud', 'aws', 'azure', 'docker', 'devops'] },
  { key: 'cyber-security', label: 'Cyber Security', aliases: ['cyber security', 'cybersecurity', 'network security', 'ethical hacking', 'cryptography'] },

  // AI and data
  { key: 'ai', label: 'Artificial Intelligence', aliases: ['artificial intelligence', 'ai'] },
  { key: 'ml', label: 'Machine Learning', aliases: ['machine learning', 'ml'], parent: 'ai' },
  { key: 'deep-learning', label: 'Deep Learning', aliases: ['deep learning', 'neural networks', 'neural network', 'cnn', 'tensorflow', 'pytorch'], parent: 'ml' },
  { key: 'nlp', label: 'NLP', aliases: ['nlp', 'natural language processing'], parent: 'ml' },
  { key: 'data-science', label: 'Data Science', aliases: ['data science', 'data analysis', 'data analytics', 'pandas', 'numpy', 'data visualization'] },

  // Electronics and hardware
  { key: 'embedded', label: 'Embedded Systems', aliases: ['embedded systems', 'embedded system', 'embedded', 'microcontrollers', 'microcontroller'] },
  { key: 'arduino', label: 'Arduino', aliases: ['arduino', 'raspberry pi'], parent: 'embedded' },
  { key: 'iot', label: 'IoT', aliases: ['iot', 'internet of things'], parent: 'embedded' },
  { key: 'digital-electronics', label: 'Digital Electronics', aliases: ['digital electronics', 'digital logic', 'logic gates', 'vlsi'] },
  { key: 'circuits', label: 'Circuit Analysis', aliases: ['circuit analysis', 'circuits', 'analog electronics', 'analog circuits'] },
  { key: 'signals', label: 'Signals & Systems', aliases: ['signals and systems', 'signal processing', 'dsp'] },

  // Mathematics
  { key: 'calculus', label: 'Calculus', aliases: ['calculus', 'differentiation', 'integration', 'differential equations'] },
  { key: 'linear-algebra', label: 'Linear Algebra', aliases: ['linear algebra', 'matrices', 'eigenvalues'] },
  { key: 'probability', label: 'Probability', aliases: ['probability', 'probability theory'] },
  { key: 'statistics', label: 'Statistics', aliases: ['statistics', 'statistical methods'] },
  { key: 'discrete-math', label: 'Discrete Mathematics', aliases: ['discrete mathematics', 'discrete math', 'combinatorics'] },
  { key: 'numerical-methods', label: 'Numerical Methods', aliases: ['numerical methods', 'numerical analysis'] },

  // Other engineering
  { key: 'thermodynamics', label: 'Thermodynamics', aliases: ['thermodynamics', 'heat transfer'] },
  { key: 'cad', label: 'CAD', aliases: ['cad', 'autocad', 'solidworks', 'engineering drawing'] },

  // Career and soft skills
  { key: 'placement-prep', label: 'Placement preparation', aliases: ['placement preparation', 'placements', 'interview preparation', 'interview prep', 'aptitude', 'resume building', 'resume'] },
  { key: 'technical-writing', label: 'Technical writing', aliases: ['technical writing', 'research paper', 'research paper writing', 'latex', 'report writing'] },
  { key: 'communication', label: 'Communication', aliases: ['communication skills', 'public speaking', 'presentation skills', 'presentations'] },
];

// Two-letter aliases that are safe to detect inside free text.
const SHORT_ALIASES_ALLOWED_IN_TEXT = new Set(['os', 'ml', 'ai', 'js', 'ts', 'dp']);

module.exports = { SKILLS, SHORT_ALIASES_ALLOWED_IN_TEXT };
