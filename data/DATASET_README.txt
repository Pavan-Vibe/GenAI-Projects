GenAI Patient Support Knowledge Assistant
=========================================

Category: GenAI / RAG

Data Files: admissions.csv, agent_performance_sla.csv, appointments.csv, chat_conversation_metadata.csv, medical_knowledge_base.json, patients.csv, prescriptions.csv


PROBLEM STATEMENT
-----------------

After discharge, patients struggle with medication instructions, symptom monitoring, and when to seek urgent care. Call centers are expensive; generic web FAQs lack personalization and may be outdated or unsafe.
A patient support knowledge assistant retrieves approved content from medical_knowledge_base.json and contextualizes answers with patient-specific data from patients.csv, prescriptions.csv, appointments.csv, and admissions.csv—always with guardrails to escalate clinical questions to providers.
Students build a HIPAA-aware RAG prototype (on synthetic data) measuring retrieval accuracy, safety refusals, and conversation quality using chat_conversation_metadata.csv and agent_performance_sla.csv.


OBJECTIVES
----------

1. Select a foundation model (GPT-4 / Azure OpenAI) for patient-facing health Q&A with strict safety constraints, low temperature, and refusal behavior for out-of-scope clinical queries.
2. Chunk and index medical_knowledge_base.json in a vector store with topic and title metadata for filtered retrieval; embed with clinical-domain embeddings.
3. Design RAG prompt templates that personalize context from patients.csv, prescriptions.csv, and admissions.csv without exposing unnecessary PHI in logs.
4. Implement prompt guardrails and escalation rules when queries exceed approved knowledge scope or mention emergency symptoms, with mandatory citation of knowledge-base sources.
5. Evaluate 25 clinical FAQ scenarios with LLM-judge and rubric metrics: accuracy, safety, citation correctness, empathy, and grounded answer rate.
6. Deploy the GenAI patient-support pipeline and report chat session metrics aligned to agent_performance_sla.csv targets with documented prompts and retrieval configuration.


NOTES
-----

Technology Reference
~~~~~~~~~~~~~~~~~~
  - GPT-4 / Azure OpenAI for grounded patient Q&A; text-embedding-ada-002 or clinical sentence-transformers for knowledge-base embeddings; FAISS/Chroma vector store; RAG with safety guardrails and mandatory citation grounding.

Dataset Descriptions
~~~~~~~~~~~~~~~~~~~~
  - admissions.csv: Hospital admission episodes (see admissions above).
  - agent_performance_sla.csv: Agent or bot performance metrics against SLA targets: response time, resolution time, and compliance flags.
  - appointments.csv: Scheduled healthcare appointments with department, no-show labels, prior no-show counts, and status.
  - chat_conversation_metadata.csv: Chat session metadata: channel, intent labels, duration, resolution status, and linked ticket IDs.
  - medical_knowledge_base.json: Approved clinical and patient education articles for RAG retrieval with topic tags.
  - patients.csv: Patient demographics, comorbidities, BMI, and baseline clinical attributes.
  - prescriptions.csv: Medication orders linked to patients and providers with drug codes and fill dates.

How Datasets Relate and Join
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
- Join patients.csv to admissions.csv on patient_id for encounter history.
- Join patients.csv to appointments.csv on patient_id for scheduling features.

Suggested ML / Analytics Approach
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Implement a RAG pipeline: chunk text sources, embed with a sentence transformer or API embeddings, retrieve top-K chunks with metadata filters, and generate answers with mandatory citations. Evaluate retrieval recall and answer faithfulness before tuning generation.

Evaluation Metrics
~~~~~~~~~~~~~~~~~~
Task completion rate, grounded answer rate, citation accuracy, escalation rate, and SLA compliance.

Student Deliverables
~~~~~~~~~~~~~~~~~~~~
- Data exploration notebook or report documenting schema, missing values, and join diagrams for all project files.
- Implemented pipeline (Python preferred) reproducible from raw CSV/JSON/JSONL/DB files in this folder.
- Model, agent, or analytics outputs with held-out evaluation using the metrics above.
- Written summary (2-3 pages) interpreting results, limitations, and recommended production next steps.
- Artifact export appropriate to project type: scored CSV, recommendation lists, agent trace logs, dashboard screenshots, or generated report samples.

Technical Notes
~~~~~~~~~~~~~~~
- All data is synthetic and intended for education, portfolio demonstrations, and prototyping.
- Do not assume external APIs or live systems; simulate tool calls against local files.
- When using GenAI components, document prompts, retrieval configuration, and safety guardrails explicitly.
- Preserve reproducibility: set random seeds, document train/validation splits, and version any embedding models used.
