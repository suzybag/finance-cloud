"use client";

export default function FlyonUiDemoPage() {
  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <nav className="navbar relative border-base-content/25 bg-base-100 max-sm:rounded-box max-sm:shadow-sm sm:z-1 sm:border-b">
        <button
          type="button"
          className="btn btn-text max-sm:btn-square me-2 sm:hidden"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="with-navbar-sidebar"
          data-overlay="#with-navbar-sidebar"
        >
          <span className="icon-[tabler--menu-2] size-5"></span>
        </button>
        <div className="flex flex-1 items-center">
          <a className="link link-neutral text-xl font-semibold no-underline" href="#">
            FlyonUI
          </a>
        </div>
        <div className="navbar-end flex items-center gap-4">
          <div className="dropdown relative inline-flex [--auto-close:inside] [--offset:8] [--placement:bottom-end]">
            <button
              id="dropdown-notifications"
              type="button"
              className="dropdown-toggle btn btn-text btn-circle size-10 dropdown-open:bg-base-content/10"
              aria-haspopup="menu"
              aria-expanded="false"
              aria-label="Dropdown"
            >
              <div className="indicator">
                <span className="indicator-item size-2 rounded-full bg-error"></span>
                <span className="icon-[tabler--bell] size-5.5 text-base-content"></span>
              </div>
            </button>
            <div
              className="dropdown-menu dropdown-open:opacity-100 hidden"
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="dropdown-notifications"
            >
              <div className="dropdown-header justify-center">
                <h6 className="text-base text-base-content">Notifications</h6>
              </div>
              <div className="max-h-56 overflow-auto overflow-y-auto overflow-x-auto text-base-content/80 max-md:max-w-60">
                <div className="dropdown-item">
                  <div className="avatar avatar-away-bottom">
                    <div className="w-10 rounded-full">
                      <img src="https://cdn.flyonui.com/fy-assets/avatar/avatar-1.png" alt="avatar 1" />
                    </div>
                  </div>
                  <div className="w-60">
                    <h6 className="truncate text-base">Charles Franklin</h6>
                    <small className="truncate text-base-content/50">Accepted your connection</small>
                  </div>
                </div>
                <div className="dropdown-item">
                  <div className="avatar">
                    <div className="w-10 rounded-full">
                      <img src="https://cdn.flyonui.com/fy-assets/avatar/avatar-2.png" alt="avatar 2" />
                    </div>
                  </div>
                  <div className="w-60">
                    <h6 className="truncate text-base">Martian added moved Charts & Maps task to the done board.</h6>
                    <small className="truncate text-base-content/50">Today 10:00 AM</small>
                  </div>
                </div>
                <div className="dropdown-item">
                  <div className="avatar avatar-online-bottom">
                    <div className="w-10 rounded-full">
                      <img src="https://cdn.flyonui.com/fy-assets/avatar/avatar-8.png" alt="avatar 8" />
                    </div>
                  </div>
                  <div className="w-60">
                    <h6 className="truncate text-base">New Message</h6>
                    <small className="truncate text-base-content/50">You have new message from Natalie</small>
                  </div>
                </div>
                <div className="dropdown-item">
                  <div className="avatar avatar-placeholder">
                    <div className="w-10 rounded-full bg-neutral p-2 text-neutral-content">
                      <span className="icon-[tabler--user] size-full"></span>
                    </div>
                  </div>
                  <div className="w-60">
                    <h6 className="truncate text-base">Application has been approved 🚀</h6>
                    <small className="text-base-content/50 text-wrap">Your ABC project application has been approved.</small>
                  </div>
                </div>
                <div className="dropdown-item">
                  <div className="avatar">
                    <div className="w-10 rounded-full">
                      <img src="https://cdn.flyonui.com/fy-assets/avatar/avatar-10.png" alt="avatar 10" />
                    </div>
                  </div>
                  <div className="w-60">
                    <h6 className="truncate text-base">New message from Jane</h6>
                    <small className="text-base-content/50 text-wrap">Your have new message from Jane</small>
                  </div>
                </div>
                <div className="dropdown-item">
                  <div className="avatar">
                    <div className="w-10 rounded-full">
                      <img src="https://cdn.flyonui.com/fy-assets/avatar/avatar-3.png" alt="avatar 3" />
                    </div>
                  </div>
                  <div className="w-60">
                    <h6 className="truncate text-base">Barry Commented on App review task.</h6>
                    <small className="truncate text-base-content/50">Today 8:32 AM</small>
                  </div>
                </div>
              </div>
              <a href="#" className="dropdown-footer justify-center gap-1">
                <span className="icon-[tabler--eye] size-4"></span>
                View all
              </a>
            </div>
          </div>
          <div className="dropdown relative inline-flex [--auto-close:inside] [--offset:8] [--placement:bottom-end]">
            <button
              id="dropdown-avatar"
              type="button"
              className="dropdown-toggle flex items-center"
              aria-haspopup="menu"
              aria-expanded="false"
              aria-label="Dropdown"
            >
              <div className="avatar">
                <div className="size-9.5 rounded-full">
                  <img src="https://cdn.flyonui.com/fy-assets/avatar/avatar-1.png" alt="avatar 1" />
                </div>
              </div>
            </button>
            <ul
              className="dropdown-menu dropdown-open:opacity-100 hidden min-w-60"
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="dropdown-avatar"
            >
              <li className="dropdown-header gap-2">
                <div className="avatar">
                  <div className="w-10 rounded-full">
                    <img src="https://cdn.flyonui.com/fy-assets/avatar/avatar-1.png" alt="avatar" />
                  </div>
                </div>
                <div>
                  <h6 className="text-base text-base-content font-semibold">John Doe</h6>
                  <small className="text-base-content/50">Admin</small>
                </div>
              </li>
              <li>
                <a className="dropdown-item" href="#">
                  <span className="icon-[tabler--user]"></span>
                  My Profile
                </a>
              </li>
              <li>
                <a className="dropdown-item" href="#">
                  <span className="icon-[tabler--settings]"></span>
                  Settings
                </a>
              </li>
              <li>
                <a className="dropdown-item" href="#">
                  <span className="icon-[tabler--receipt-rupee]"></span>
                  Billing
                </a>
              </li>
              <li>
                <a className="dropdown-item" href="#">
                  <span className="icon-[tabler--help-triangle]"></span>
                  FAQs
                </a>
              </li>
              <li className="dropdown-footer gap-2">
                <a className="btn btn-error btn-soft btn-block" href="#">
                  <span className="icon-[tabler--logout]"></span>
                  Sign out
                </a>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <aside
        id="with-navbar-sidebar"
        className="overlay drawer drawer-start overlay-open:translate-x-0 hidden max-w-64 sm:absolute sm:z-0 sm:flex sm:translate-x-0 sm:shadow-none pt-16"
        role="dialog"
        tabIndex={-1}
      >
        <div className="drawer-body px-2 pt-4">
          <ul className="menu p-0">
            <li>
              <a href="#">
                <span className="icon-[tabler--home] size-5"></span>
                Home
              </a>
            </li>
            <li>
              <a href="#">
                <span className="icon-[tabler--user] size-5"></span>
                Account
              </a>
            </li>
            <li>
              <a href="#">
                <span className="icon-[tabler--message] size-5"></span>
                Notifications
              </a>
            </li>
            <li>
              <a href="#">
                <span className="icon-[tabler--mail] size-5"></span>
                Email
              </a>
            </li>
            <li>
              <a href="#">
                <span className="icon-[tabler--calendar] size-5"></span>
                Calendar
              </a>
            </li>
            <li>
              <a href="#">
                <span className="icon-[tabler--shopping-bag] size-5"></span>
                Product
              </a>
            </li>
            <li>
              <a href="#">
                <span className="icon-[tabler--login] size-5"></span>
                Sign In
              </a>
            </li>
            <li>
              <a href="#">
                <span className="icon-[tabler--logout-2] size-5"></span>
                Sign Out
              </a>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
