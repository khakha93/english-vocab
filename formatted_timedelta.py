from datetime import timedelta

class FormattedTimedelta(timedelta):
    def __str__(self):
        mm, ss = divmod(self.seconds, 60)
        hh, mm = divmod(mm, 60)
        s = "%02d:%02d:%02d" % (hh, mm, ss)
        if self.days:
            def plural(n):
                return n, abs(n) != 1 and "s" or ""
            s = ("%d day%s, " % plural(self._days)) + s
        if self.microseconds:
            s = s + ".%06d" % self.microseconds
        return s
