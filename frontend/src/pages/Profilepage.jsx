import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import TopNavbar from "../Components/TopNavbar";
import { IoCameraOutline } from "react-icons/io5";
import image from "../images/user.png";
import { updateProfile } from "../features/authSlice";
import toast from "react-hot-toast";
import FormattedTime from "../lib/FormattedTime ";

function ProfilePage() {
  const dispatch = useDispatch();
  const { Authuser } = useSelector((state) => state.auth);
  const { userdata } = useSelector((state) => state.activity);
  const [images, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      toast.error("No file selected");
      return;
    }

    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (!storedUser) {
      toast.error("User not authenticated. Please log in again.");
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = async () => {
      const base64Image = reader.result;
      setUploading(true);
      try {
        const updatedUser = await dispatch(updateProfile(base64Image)).unwrap();
        toast.success("Profile updated successfully");
        setImage(updatedUser?.ProfilePic);
      } catch (error) {
        console.error("Error uploading image:", error);
        toast.error(error || "Failed to upload image. Please try again.");
      } finally {
        setUploading(false);
      }
    };

    reader.onerror = () => {
      toast.error("Error reading file");
    };
  };

  const logs = Array.isArray(userdata?.[0]) ? userdata[0] : [];

  return (
    <div className="min-h-screen bg-base-200 text-base-content">
      <TopNavbar />

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Profile card */}
          <div className="w-full rounded-xl border border-base-300 bg-base-100 p-6 text-center shadow-sm lg:w-80 lg:shrink-0">
            <div className="relative mx-auto mb-6 h-32 w-32">
              <img
                className="h-32 w-32 rounded-full border-4 border-primary object-cover shadow-lg"
                src={Authuser?.ProfilePic || images || image}
                alt="Profile"
              />
              <input
                type="file"
                id="fileInput"
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />
              <label
                htmlFor="fileInput"
                className={`absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md transition ${
                  uploading
                    ? "cursor-wait bg-primary/60"
                    : "cursor-pointer bg-primary hover:bg-primary/90"
                }`}
              >
                <IoCameraOutline className="text-lg" />
              </label>
            </div>

            {uploading && (
              <p className="mb-4 text-sm text-base-content/60">Uploading…</p>
            )}

            <div className="space-y-4 text-left">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
                  Name
                </p>
                <p className="text-base font-medium text-base-content">
                  {Authuser?.name || "Guest"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
                  Email
                </p>
                <p className="break-all text-base font-medium text-base-content">
                  {Authuser?.email || "guest@gmail.com"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
                  Role
                </p>
                <p className="text-base font-medium capitalize text-base-content">
                  {Authuser?.role || "staff"}
                </p>
              </div>
            </div>
          </div>

          {/* Recent activity */}
          <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-base-300 bg-base-100 shadow-sm">
            <h1 className="border-b border-base-300 px-5 py-4 text-lg font-semibold text-base-content">
              Recent Activity
            </h1>
            <div className="max-h-[28rem] space-y-3 overflow-y-auto p-5">
              {logs.length > 0 ? (
                logs.map((log, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-base-300 bg-base-200 p-4"
                  >
                    <h2 className="font-medium text-base-content">{log.action}</h2>
                    <p className="mt-1 text-sm text-base-content/70">{log.description}</p>
                    <p className="mt-1 text-sm text-base-content/50">
                      Affected part: <span className="font-medium">{log.entity}</span>
                    </p>
                    <p className="text-sm text-base-content/50">
                      IP Address: <span className="font-medium">{log.ipAddress}</span>
                    </p>
                    <div className="mt-1 text-xs text-base-content/40">
                      <FormattedTime timestamp={log.createdAt} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-base-content/50">
                  No activity logs available
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
