import { toast } from "sonner";

export const showSuccess = (message: string) => {
  return toast.success(message, {
    duration: 4000,
    dismissible: true,
    closeButton: true,
  });
};

export const showError = (message: string) => {
  return toast.error(message, {
    duration: 6000,
    dismissible: true,
    closeButton: true,
  });
};

export const showLoading = (message: string) => {
  return toast.loading(message, {
    dismissible: true,
    closeButton: true,
  });
};

export const dismissToast = (toastId: string) => {
  toast.dismiss(toastId);
};