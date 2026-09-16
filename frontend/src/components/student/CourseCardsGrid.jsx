import { BookOpen, ArrowRight, PlayCircle, AlertCircle } from 'lucide-react';

export default function CourseCardsGrid({ onSelectCourse, onLaunchSession }) {
  const COURSES = [
    {
      code: 'CS101',
      title: 'Data Structures & Algorithms',
      instructor: 'Prof. Sarah Jenkins',
      schedule: 'Mon, Wed, Fri • 10:00 AM',
      progress: 78,
      amberTag: 'Socratic Session Active',
      status: 'live',
      color: '#2563EB'
    },
    {
      code: 'MATH202',
      title: 'Linear Algebra & Vector Spaces',
      instructor: 'Dr. Robert Vance',
      schedule: 'Tue, Thu • 02:00 PM',
      progress: 62,
      amberTag: 'Assignment 4 due in 5 hrs',
      status: 'upcoming',
      color: '#10B981'
    },
    {
      code: 'PHYS105',
      title: 'Quantum Mechanics Fundamentals',
      instructor: 'Dr. Elena Rostova',
      schedule: 'Mon, Wed • 01:15 PM',
      progress: 90,
      amberTag: 'Lab Quiz tomorrow at 10 AM',
      status: 'on_track',
      color: '#F59E0B'
    }
  ];

  return (
    <div className="calm-card calm-fade-in">
      <div className="calm-card-header">
        <div className="calm-card-title-group">
          <div className="calm-card-icon icon-blue">
            <BookOpen size={18} />
          </div>
          <div>
            <h3 className="calm-card-title">Enrolled Courses ({COURSES.length})</h3>
            <span className="calm-card-subtitle">Active learning modules and upcoming session prompts</span>
          </div>
        </div>
      </div>

      <div className="calm-courses-grid">
        {COURSES.map((course) => (
          <div key={course.code} className="calm-course-card">
            <div className="calm-course-card-top">
              <div className="calm-course-header-row">
                <span className="calm-course-badge">{course.code}</span>
                {course.amberTag && (
                  <span className={`calm-course-status-pill ${course.status === 'live' ? 'pill-live' : 'pill-alert'}`}>
                    <span className="pill-dot" />
                    {course.amberTag}
                  </span>
                )}
              </div>

              <h4 className="calm-course-title">
                {course.title}
              </h4>
              <p className="calm-course-meta">
                {course.instructor} • {course.schedule}
              </p>
            </div>

            <div className="calm-course-card-bottom">
              <div className="calm-course-progress-row">
                <span className="calm-course-progress-label">Module Completion</span>
                <span className="calm-course-progress-val">{course.progress}%</span>
              </div>

              <div className="calm-progress-bar-bg">
                <div
                  className="calm-progress-bar-fill"
                  style={{
                    width: `${course.progress}%`,
                    backgroundColor: course.color
                  }}
                />
              </div>

              <div className="calm-course-action-row">
                {course.status === 'live' ? (
                  <button
                    type="button"
                    className="calm-btn calm-btn-primary calm-btn-sm calm-btn-block"
                    onClick={() => onLaunchSession(course.code)}
                  >
                    <PlayCircle size={14} /> Join Active Session
                  </button>
                ) : (
                  <button
                    type="button"
                    className="calm-btn calm-btn-ghost calm-btn-sm calm-btn-block"
                    onClick={() => onSelectCourse(course.code)}
                  >
                    Continue Course <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
